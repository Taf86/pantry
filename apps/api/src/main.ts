import { createAuth } from "./auth.js";
import { loadConfig } from "./config/env.js";
import type { AppServices } from "./context.js";
import { createDatabase } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seedCategories } from "./db/seed/categories.js";
import { startCleanupJob } from "./jobs/cleanup.js";
import { createLogger } from "./logger.js";
import { nullEventBus } from "./realtime/events.js";
import { createRealtime } from "./realtime/io.js";
import { createAdminNotifier } from "./services/notifications/admin-notifier.js";
import { createAppLimits } from "./server/rate-limit.js";
import { buildServer } from "./server/server.js";

const SHUTDOWN_TIMEOUT_MS = 8_000;

const main = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger(config);
  const { db, close: closeDb } = createDatabase(config, logger);
  await runMigrations(db, logger);
  await seedCategories(db);
  const limits = createAppLimits();
  const notifier = createAdminNotifier({ db, config, logger });
  const services: AppServices = {
    config,
    db,
    logger,
    limits,
    notifier,
    auth: createAuth(db, config),
    events: nullEventBus,
  };
  const app = await buildServer(services);
  await app.ready();

  // The bus is swapped in after the HTTP server exists. Until then services
  // publish into the null bus, which is exactly right: nobody can be listening
  // before the server is up.
  const realtime = createRealtime(app.server, services);
  services.events = realtime.bus;

  const stopCleanup = startCleanupJob(db, logger);
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info({ port: config.PORT }, "pantry-api listening.");

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    const watchdog = setTimeout(() => {
      logger.fatal({ signal }, "Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    watchdog.unref();

    try {
      logger.info({ signal }, "Shutting down.");
      await stopCleanup();
      await notifier.stop();
      limits.stop();
      await realtime.close();
      await app.close();
      await closeDb();
    } catch (error) {
      logger.error({ error }, "Forced shut down");
      process.exitCode = 1;
    } finally {
      clearTimeout(watchdog);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(signal));
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
