import {
  type CreateUserInput,
  type InviteLink,
  type SetUserRoleInput,
  type SetUserStatusInput,
  type UserExtended,
  serializeDates,
} from "@pantry/shared";
import type { Database, Executor } from "../../db/client.js";
import { users } from "../../db/schema/users.js";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { issueInviteTx } from "./invites.service.js";
import { sessions } from "../../db/schema/sessions.js";

export const listUsers = async (deps: AdminDeps): Promise<UserExtended[]> => {
  const rows = await deps.db
    .select(userSelection)
    .from(users)
    .orderBy(asc(users.displayName));
  return rows.map(serializeDates);
};

export const requireUser = async (deps: AdminDeps, userId: string) => {
  const [row] = await deps.db
    .select(userSelection)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not existing." });
  }
  return serializeDates(row);
};

export const createUser = async (
  deps: AdminDeps,
  actorId: string | null,
  input: CreateUserInput,
): Promise<{ user: UserExtended; invite: InviteLink }> => {
  const invite = await deps.db.transaction(async (tx) => {
    const { userId } = await createUserTx(tx, input);
    return await issueInviteTx(tx, userId, actorId ?? userId);
  });

  return { user: await requireUser(deps, invite.userId), invite };
};

export const regenerateInvite = async (
  deps: AdminDeps,
  actorId: string,
  userId: string,
): Promise<{ user: UserExtended; invite: InviteLink }> => {
  const user = await requireUser(deps, userId);
  const invite = await issueInviteTx(deps.db, userId, actorId);
  return { user, invite };
};

export const setStatus = async (
  deps: AdminDeps,
  actorId: string,
  input: SetUserStatusInput,
): Promise<UserExtended> => {
  const { userId, status } = input;
  if (userId === actorId && status !== "active") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You cannot suspend yourself.",
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
      message: "At least one admin must remain active",
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
  input: SetUserRoleInput,
): Promise<UserExtended> => {
  const { userId, role } = input;
  if (role !== "admin" && (await countAdmins(deps, userId)) === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "At least one admin must remain active",
    });
  }

  await deps.db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return requireUser(deps, userId);
};

const createUserTx = async (
  tx: Executor,
  input: CreateUserInput,
): Promise<{ userId: string }> => {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "There is another user with same email.",
    });
  }

  const userId = randomUUID();
  await tx.insert(users).values({
    id: userId,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    status: "unactivated",
  });

  return { userId };
};

interface AdminDeps {
  db: Database;
}

const userSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  lastSeenAt: users.lastSeenAt,
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
