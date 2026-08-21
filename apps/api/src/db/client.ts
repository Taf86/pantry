import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { AppConfig } from "../config/env.js";
import { relations } from "./relations.js";
import type { Logger } from "pino";

type Relations = typeof relations;
export type Database = PostgresJsDatabase<Relations>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

export const createDatabase = (
  config: AppConfig,
  logger?: Logger,
): DatabaseHandle => {
  const client = postgres(config.databaseUrl, {
    max: config.DB_POOL_MAX,
    onnotice: logger
      ? (notice) => {
          if (notice["severity"] === "WARNING")
            logger.warn({ notice }, "postgres warning");
          else logger.debug({ notice }, "postgres notice");
        }
      : () => {},
  });

  const db = drizzle({ client, relations, logger: true });

  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
};
