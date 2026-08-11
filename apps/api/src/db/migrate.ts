import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import type { Database } from "./client.js";
import { seedCategories } from "./seed-categories.js";

export const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
);

/**
 * Migrazioni applicate all'avvio, prima che il server accetti traffico.
 * Solo migrazioni additive: un deploy deve poter tornare indietro.
 */
export const runMigrations = async (db: Database): Promise<void> => {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await seedCategories(db);
};
