# syntax=docker/dockerfile:1

# Contesto di build: la radice del monorepo (serve il lockfile condiviso).
#   docker build -f apps/api/Dockerfile -t pantry-api .

FROM node:22.14-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---------------------------------------------------------------- dipendenze
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# `--frozen-lockfile`: un lockfile disallineato deve fermare il deploy, non
# essere aggiustato in silenzio dal builder.
RUN pnpm install --frozen-lockfile --filter pantry-api...

# -------------------------------------------------------------------- build
FROM deps AS build
WORKDIR /repo
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter pantry-shared build && pnpm --filter pantry-api build

# ------------------------------------------------------- dipendenze runtime
FROM base AS prod-deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter pantry-api...

# ------------------------------------------------------------------ runtime
FROM node:22.14-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
# Le migrazioni viaggiano con l'immagine: il container che parte sa portare
# lo schema alla versione che il suo codice si aspetta.
COPY --from=build /repo/apps/api/drizzle ./apps/api/drizzle

USER node
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
