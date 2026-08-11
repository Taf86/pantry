import { loadLocalEnv } from "../src/config/dotenv.js";

/**
 * Le suite di integrazione si attivano da sole quando c'è un database.
 *
 * Senza questo, `POSTGRES_PASSWORD` non arriverebbe mai a `integrationEnabled`
 * — vitest non è un processo Node a cui si possano passare flag — e le
 * asserzioni resterebbero saltate anche con Postgres acceso. Silenziosamente,
 * che è il modo peggiore.
 */
loadLocalEnv();
