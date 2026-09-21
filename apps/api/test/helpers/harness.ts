import { randomUUID } from "node:crypto";

import type { UserRole, UserStatus } from "@pantry/shared";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";

import { createAuth, type Auth } from "../../src/auth.js";
import { buildDbUrl } from "../../src/config/db.js";
import { loadConfig, type AppConfig } from "../../src/config/env.js";
import { createDatabase, type Database } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema/index.js";

export interface Harness {
  db: Database;
  auth: Auth;
  config: AppConfig;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const TEST_DB = {
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: "5432",
  POSTGRES_USER: "pantry",
  POSTGRES_PASSWORD: "pantry",
  POSTGRES_DB: "pantry_test",
};

export const testConfig = (): AppConfig =>
  loadConfig({
    ...TEST_DB,
    NODE_ENV: "test",
    DOMAIN: "test.local",
    BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnop",
  });

const maintenanceClient = () =>
  postgres(buildDbUrl({ ...TEST_DB, POSTGRES_DB: "postgres" }), {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });

export const assertReachable = async (): Promise<void> => {
  const client = maintenanceClient();
  try {
    await client`SELECT 1`;
  } catch (error) {
    throw new Error(unreachableMessage(error), { cause: error });
  } finally {
    await client.end({ timeout: 5 });
  }
};

const unreachableMessage = (error: unknown): string => {
  const where = `${TEST_DB.POSTGRES_HOST}:${TEST_DB.POSTGRES_PORT}`;
  const code = (error as { code?: string }).code;

  switch (code) {
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
    case "ETIMEDOUT":
    case "CONNECT_TIMEOUT":
      return `No Postgres at ${where}. The test suites need a real database: start it with \`pnpm db:up\`.`;
    case "28P01":
    case "28000":
      return `Postgres at ${where} refused user "${TEST_DB.POSTGRES_USER}". The harness has the credentials hard-coded and expects the container from docker-compose.dev.yml; a different instance on that port will not do.`;
    default:
      return `Cannot reach Postgres at ${where}: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const ensureDatabase = async (config: AppConfig): Promise<void> => {
  const maintenance = maintenanceClient();

  try {
    const existing = await maintenance`
      SELECT 1 FROM pg_database WHERE datname = ${config.POSTGRES_DB}
    `;
    if (existing.length === 0) {
      await maintenance.unsafe(`CREATE DATABASE "${config.POSTGRES_DB}"`);
    }
  } finally {
    await maintenance.end({ timeout: 5 });
  }
};

const tableNames = (Object.values(schema) as unknown[])
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);

export const createHarness = async (): Promise<Harness> => {
  const config = testConfig();
  await ensureDatabase(config);

  const handle = createDatabase(config);
  await runMigrations(handle.db);

  const reset = async (): Promise<void> => {
    await handle.db.execute(
      sql.raw(`TRUNCATE ${tableNames.join(", ")} RESTART IDENTITY CASCADE`),
    );
  };

  await reset();

  return {
    db: handle.db,
    auth: createAuth(handle.db, config),
    config,
    reset,
    close: handle.close,
  };
};

export const makeUser = async (
  harness: Harness,
  overrides: {
    email?: string;
    displayName?: string;
    role?: UserRole;
    status?: UserStatus;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  await harness.db.insert(schema.users).values({
    id,
    email: overrides.email ?? `${id}@example.com`,
    displayName: overrides.displayName ?? `User ${id.slice(0, 4)}`,
    role: overrides.role ?? "user",
    status: overrides.status ?? "active",
  });
  return id;
};
