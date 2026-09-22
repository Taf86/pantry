import Fastify, { LogController } from "fastify";
import type { AppServices } from "../context.js";

export const createApp = (services: AppServices) =>
  Fastify({
    loggerInstance: services.logger,
    trustProxy: 1,
    bodyLimit: 1_048_576,
    logController: new LogController({
      disableRequestLogging: !services.config.isProduction,
    }),
  });

export type AppServer = ReturnType<typeof createApp>;
