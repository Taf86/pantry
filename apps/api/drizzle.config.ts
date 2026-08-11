import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit` è uno strumento di sviluppo: gira solo sulla macchina di chi
 * scrive le migrazioni. In esecuzione le applica `src/db/migrate.ts`, prima
 * che il server accetti traffico.
 *
 * L'URL si compone qui dalle stesse parti usate dall'applicazione, senza
 * importare `src/env.ts`: la configurazione dello strumento non deve
 * dipendere dal grafo dei moduli dell'app.
 */
const env = process.env;

const databaseUrl = `postgres://${encodeURIComponent(
  env["POSTGRES_USER"] ?? "pantry",
)}:${encodeURIComponent(env["POSTGRES_PASSWORD"] ?? "pantry")}@${
  env["POSTGRES_HOST"] ?? "localhost"
}:${env["POSTGRES_PORT"] ?? "5432"}/${env["POSTGRES_DB"] ?? "pantry"}`;

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
