import { createAuth } from "./auth/auth.js";
import type { AppServices } from "./context.js";
import { createDatabase } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { loadConfig } from "./env.js";
import { startCleanupJob } from "./jobs/cleanup.js";
import { createLogger } from "./logger.js";
import { nullEventBus } from "./realtime/events.js";
import { createRealtime } from "./realtime/io.js";
import { buildServer } from "./server.js";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger(config);
  const { db, close } = createDatabase(config);

  // Le migrazioni girano prima che il server accetti traffico: un container
  // che parte con lo schema vecchio servirebbe errori per qualche secondo.
  await runMigrations(db);
  logger.info("migrazioni applicate");

  const services: AppServices = {
    config,
    db,
    logger,
    auth: createAuth(db, config),
    // Il bus vero arriva quando il server HTTP esiste: fino ad allora le
    // eventuali pubblicazioni cadono nel vuoto invece di esplodere.
    events: nullEventBus,
  };

  const app = await buildServer(services);
  await app.ready();

  const realtime = createRealtime(app.server, services);
  services.events = realtime.bus;

  const stopCleanup = startCleanupJob(db, logger);

  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info({ port: config.PORT }, "pantry-api in ascolto");

  /**
   * Spegnimento ordinato: prima si smette di accettare richieste, poi si
   * chiudono i socket, infine il pool. In ordine inverso, una richiesta in
   * volo troverebbe il database già chiuso.
   */
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "spegnimento in corso");
    stopCleanup();
    try {
      await app.close();
      await realtime.close();
      await close();
    } catch (error) {
      logger.error({ error }, "spegnimento non pulito");
      process.exitCode = 1;
    }
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => void shutdown(signal));
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
