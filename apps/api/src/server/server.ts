import type { AppServices } from "../context.js";
import { createApp, type AppServer } from "./app.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTRPCRoutes } from "./routes/trpc.js";

export const buildServer = async (
  services: AppServices,
): Promise<AppServer> => {
  const app = createApp(services);
  registerHealthRoute(app, services);
  await registerAuthRoutes(app, services);
  await registerTRPCRoutes(app, services);
  return app;
};
