import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client.js";
import type { Logger } from "pino";

export const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
);

export const runMigrations = async (
  db: Database,
  logger: Logger,
): Promise<void> => {
  logger.info("Applying migrations...");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  logger.info("Migrations applied.");
};
