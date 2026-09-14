import type { AppServices } from "../../context.js";
import type { AppServer } from "../app.js";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { appRouter, type AppRouter } from "../../trpc/routers/index.js";
import { createContextFactory } from "../../trpc/context.js";

export const registerTRPCRoutes = async (
  app: AppServer,
  services: AppServices,
) => {
  await app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(services),
      onError({ error, path }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          services.logger.error({ error, path }, "unhandled tRPC error");
        }
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });
};
