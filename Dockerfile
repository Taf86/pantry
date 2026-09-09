# syntax=docker/dockerfile:1.11

ARG NODE_IMAGE=node:22-alpine3.22
ARG CADDY_IMAGE=caddy:2.10-alpine
ARG PNPM_VERSION=9.2.0

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm --version
ENV npm_config_store_dir=/pnpm/store
WORKDIR /app

FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json        apps/api/package.json
COPY apps/web/package.json        apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

FROM manifests AS deps
RUN --mount=type=cache,id=pantry-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

FROM deps AS builder-api
COPY packages/shared packages/shared
RUN pnpm --filter=@pantry/shared run build
COPY apps/api apps/api
RUN pnpm --filter=pantry-api run build
RUN rm -f apps/api/dist/.tsbuildinfo packages/shared/dist/.tsbuildinfo \
 && find apps/api/dist packages/shared/dist -name '*.d.ts.map' -delete
RUN pnpm deploy --filter=pantry-api --prod --no-optional /prod/api \
 && rm -rf /prod/api/src /prod/api/scripts /prod/api/test \
           /prod/api/tsconfig*.json /prod/api/*.config.ts /prod/api/*.config.mjs

FROM builder-api AS builder-web
COPY apps/web apps/web
RUN pnpm --filter=pantry-web run build

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=builder-api /prod/api /app
RUN node --input-type=module -e "\
import { existsSync, readdirSync } from 'node:fs'; \
const { MIGRATIONS_FOLDER } = await import('./dist/db/migrate.js'); \
await import('./dist/server.js'); \
await import('./dist/auth.js'); \
if (!existsSync(MIGRATIONS_FOLDER)) throw new Error('Missing migration folder: ' + MIGRATIONS_FOLDER); \
console.log('smoke ok — ' + readdirSync(MIGRATIONS_FOLDER).length + ' migrations in ' + MIGRATIONS_FOLDER);"
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["node","-e","const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>r.ok?r.json():Promise.reject(new Error(r.status))).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"]
LABEL org.opencontainers.image.title="pantry-api"
CMD ["node", "dist/main.js"]

FROM ${CADDY_IMAGE} AS web
COPY --from=builder-web /app/apps/web/dist/ /srv/
RUN find /srv -name '*.map' -delete \
 && echo "payload SPA: $(du -sh /srv | cut -f1)"
COPY Caddyfile /etc/caddy/Caddyfile
RUN caddy fmt --overwrite /etc/caddy/Caddyfile \
 && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget","--quiet","--tries=1","--spider","http://127.0.0.1:8080/healthz"]
LABEL org.opencontainers.image.title="pantry-web"