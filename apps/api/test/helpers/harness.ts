import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { Role, uuidv7 } from "pantry-shared";
import { pino } from "pino";

import { createDatabase, type DatabaseHandle } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import { users } from "../../src/db/schema/auth.js";
import { listMembers, lists } from "../../src/db/schema/lists.js";
import { pantries, pantryMembers } from "../../src/db/schema/pantries.js";
import { loadConfig } from "../../src/env.js";
import { createRecordingEventBus } from "../../src/realtime/events.js";
import type { ServiceDeps } from "../../src/services/types.js";

/**
 * Le suite di integrazione girano su Postgres vero.
 *
 * Non c'è un finto database: le invarianti che contano in questa applicazione
 * — locking ottimistico, `ON CONFLICT DO NOTHING`, CTE ricorsive, UPDATE
 * relativi — *sono* comportamento del database. Verificarle contro una
 * simulazione proverebbe solo che la simulazione funziona.
 *
 * Senza `POSTGRES_PASSWORD` le suite si saltano invece di fallire, così un
 * checkout appena clonato resta verde.
 */
export const integrationEnabled = Boolean(process.env["POSTGRES_PASSWORD"]);

export interface Harness extends DatabaseHandle {
  deps: ServiceDeps & { events: ReturnType<typeof createRecordingEventBus> };
  reset: () => Promise<void>;
}

const TABLES = [
  "applied_mutations",
  "list_items",
  "list_members",
  "lists",
  "pantry_nodes",
  "pantry_members",
  "pantries",
  "invites",
  "signup_requests",
  "accounts",
  "sessions",
  "verifications",
  "users",
];

export const createHarness = async (): Promise<Harness> => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DOMAIN: process.env["DOMAIN"] ?? "test.local",
    BETTER_AUTH_SECRET:
      process.env["BETTER_AUTH_SECRET"] ?? "test-secret-abcdefghijklmnop",
    POSTGRES_HOST: process.env["POSTGRES_HOST"] ?? "localhost",
  });

  const handle = createDatabase(config);
  await runMigrations(handle.db);

  const events = createRecordingEventBus();

  const reset = async (): Promise<void> => {
    await handle.db.execute(
      sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`),
    );
    events.events.length = 0;
  };

  await reset();

  return { ...handle, deps: { db: handle.db, events }, reset };
};

export const makeUser = async (
  harness: Harness,
  overrides: { email?: string; role?: "user" | "admin" } = {},
): Promise<string> => {
  const id = randomUUID();
  await harness.db.insert(users).values({
    id,
    email: overrides.email ?? `${id}@esempio.it`,
    displayName: `Utente ${id.slice(0, 4)}`,
    role: overrides.role ?? "user",
    status: "active",
  });
  return id;
};

export const makeList = async (
  harness: Harness,
  ownerId: string,
  permissions: number = Role.Owner,
): Promise<string> => {
  const id = uuidv7();
  await harness.db
    .insert(lists)
    .values({ id, name: "Lista di prova", ownerId });
  await harness.db
    .insert(listMembers)
    .values({ listId: id, userId: ownerId, permissions });
  return id;
};

export const makePantry = async (
  harness: Harness,
  ownerId: string,
  permissions: number = Role.Owner,
): Promise<string> => {
  const id = uuidv7();
  await harness.db
    .insert(pantries)
    .values({ id, name: "Dispensa di prova", ownerId });
  await harness.db
    .insert(pantryMembers)
    .values({ pantryId: id, userId: ownerId, permissions });
  return id;
};

/** Logger silenzioso per i pochi punti che ne pretendono uno. */
export const silentLogger = pino({ level: "silent" });
