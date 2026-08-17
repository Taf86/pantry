import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type {
  AdminUser,
  CreateUserInput,
  InviteLink,
  UserRole,
  UserStatus,
} from "pantry-shared";

import type { Database, Executor } from "../db/client.js";
import { sessions, users } from "../db/schema/auth.js";
import { issueInvite, pendingInviteCondition } from "./invites.service.js";

export interface AdminDeps {
  db: Database;
}

const lastSeenSql = sql<Date | null>`(
  SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = ${users.id}
)`;

const toAdminUser = (row: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
  hasPendingInvite: boolean;
}): AdminUser => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  role: row.role === "admin" ? "admin" : "user",
  status:
    row.status === "active" || row.status === "suspended"
      ? row.status
      : "invited",
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
  hasPendingInvite: row.hasPendingInvite,
});

const selection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  lastSeenAt: lastSeenSql,
  hasPendingInvite: sql<boolean>`${pendingInviteCondition}`,
};

export const listUsers = async (deps: AdminDeps): Promise<AdminUser[]> => {
  const rows = await deps.db
    .select(selection)
    .from(users)
    .orderBy(asc(users.displayName));
  return rows.map(toAdminUser);
};

export const requireUser = async (deps: AdminDeps, userId: string) => {
  const [row] = await deps.db
    .select(selection)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Utente inesistente" });
  }
  return toAdminUser(row);
};

/**
 * Creazione dell'utente e del suo primo invito, su un esecutore altrui.
 *
 * Prende un `Executor` e non un `Database` perché l'approvazione di una
 * richiesta di registrazione deve creare l'utente nella *stessa* transazione in
 * cui segna la richiesta come evasa: se la creazione fallisce, la richiesta
 * deve tornare in coda.
 */
export const createUserTx = async (
  tx: Executor,
  /** `null` allo startup: il primo amministratore invita sé stesso. */
  actorId: string | null,
  input: CreateUserInput,
): Promise<InviteLink> => {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Esiste già un utente con questa email",
    });
  }

  const userId = randomUUID();
  await tx.insert(users).values({
    id: userId,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    status: "invited",
  });

  return issueInvite(tx, userId, actorId ?? userId);
};

/**
 * Creazione di un utente dal backoffice.
 *
 * Il token in chiaro esiste solo nella risposta di questa chiamata: l'admin lo
 * consegna fuori banda e, se lo perde, ne rigenera un altro. Non c'è modo di
 * recuperarlo, ed è il punto.
 */
export const createUser = async (
  deps: AdminDeps,
  actorId: string | null,
  input: CreateUserInput,
): Promise<{ user: AdminUser; invite: InviteLink }> => {
  const invite = await deps.db.transaction((tx) =>
    createUserTx(tx, actorId, input),
  );

  return { user: await requireUser(deps, invite.userId), invite };
};

export const regenerateInvite = async (
  deps: AdminDeps,
  actorId: string,
  userId: string,
): Promise<{ user: AdminUser; invite: InviteLink }> => {
  const invite = await deps.db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Utente inesistente" });
    }
    return issueInvite(tx, userId, actorId);
  });

  return { user: await requireUser(deps, userId), invite };
};

const countAdmins = async (deps: AdminDeps, excludingUserId: string) => {
  const [row] = await deps.db
    .select({ value: count() })
    .from(users)
    .where(
      and(
        eq(users.role, "admin"),
        eq(users.status, "active"),
        ne(users.id, excludingUserId),
      ),
    );
  return row?.value ?? 0;
};

/**
 * Sospensione e riattivazione.
 *
 * Sospendere cancella le sessioni: con le sessioni su database la revoca è
 * istantanea, e sarebbe assurdo non usarla.
 */
export const setStatus = async (
  deps: AdminDeps,
  actorId: string,
  userId: string,
  status: UserStatus,
): Promise<AdminUser> => {
  if (userId === actorId && status !== "active") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Non puoi sospendere te stesso",
    });
  }

  const target = await requireUser(deps, userId);
  if (
    target.role === "admin" &&
    status !== "active" &&
    (await countAdmins(deps, userId)) === 0
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Deve restare almeno un amministratore attivo",
    });
  }

  await deps.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId));

    if (status !== "active") {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    }
  });

  return requireUser(deps, userId);
};

export const setRole = async (
  deps: AdminDeps,
  actorId: string,
  userId: string,
  role: UserRole,
): Promise<AdminUser> => {
  if (
    userId === actorId &&
    role !== "admin" &&
    (await countAdmins(deps, userId)) === 0
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Deve restare almeno un amministratore attivo",
    });
  }

  await deps.db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return requireUser(deps, userId);
};

/** Ricerca utenti per la UI di condivisione: solo account attivi. */
export const searchActiveUsers = async (
  deps: AdminDeps,
  query: string,
  limit: number,
) => {
  const pattern = `%${query.trim().toLowerCase()}%`;
  return deps.db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        sql`(lower(${users.email}) LIKE ${pattern} OR lower(${users.displayName}) LIKE ${pattern})`,
      ),
    )
    .orderBy(asc(users.displayName))
    .limit(limit);
};
