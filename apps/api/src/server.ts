import Fastify, { LogController, type FastifyRequest } from "fastify";
import type { AppServices } from "./context.js";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { appRouter, type AppRouter } from "./trpc/routers/index.js";
import { createContextFactory } from "./trpc/context.js";

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

const createApp = (services: AppServices) =>
  Fastify({
    loggerInstance: services.logger,
    trustProxy: true,
    bodyLimit: 1_048_576,

    logController: new LogController({
      disableRequestLogging: !services.config.isProduction,
    }),
  });

export type AppServer = ReturnType<typeof createApp>;

const toWebRequest = (request: FastifyRequest, origin: string): Request => {
  const url = new URL(request.url, origin);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      headers.append(key, entry);
    }
  }

  const body = METHODS_WITHOUT_BODY.has(request.method)
    ? null
    : ((request.body as string | undefined) ?? null);

  return new Request(url, { method: request.method, headers, body });
};

const registerAuthRoutes = async (
  app: AppServer,
  services: AppServices,
): Promise<void> => {
  await app.register((instance, _opts, done) => {
    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser(
      "*",
      { parseAs: "string" },
      (_request, body, next) => {
        next(null, body);
      },
    );

    instance.all("/api/auth/*", async (request, reply) => {
      const response = await services.auth.handler(
        toWebRequest(request, services.config.appUrl),
      );

      reply.status(response.status);
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === "set-cookie") continue;
        reply.header(key, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);

      return reply.send(response.body ? await response.text() : null);
    });

    done();
  });
};

export const buildServer = async (
  services: AppServices,
): Promise<AppServer> => {
  const app = createApp(services);

  app.get("/api/health", () => ({ status: "ok" }));

  await registerAuthRoutes(app, services);
  await app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(services),
      onError({ error, path }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          services.logger.error({ error, path }, "errore tRPC non gestito");
        }
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });
  return app;
};
