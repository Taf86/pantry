import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { AppConfig } from "../env.js";
import * as schema from "./schema/index.js";

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

/** Callback di `db.transaction`, cioè l'esecutore dentro la transazione. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Database e transazione espongono la stessa superficie per ciò che serve ai
 * servizi. Accettando questo tipo, ogni servizio funziona sia dentro sia fuori
 * da una transazione senza duplicarsi.
 */
export type Executor = Database | Transaction;

export interface DatabaseHandle {
  db: Database;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export const createDatabase = (config: AppConfig): DatabaseHandle => {
  const sql = postgres(config.databaseUrl, {
    max: config.DB_POOL_MAX,
    onnotice: () => {},
  });

  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
};
