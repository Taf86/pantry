import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  Permission,
  Role,
  can,
  type CreatePantryInput,
  type DeletePantryInput,
  type PantryDetail,
  type PantrySummary,
  type SharePantryInput,
  type UnsharePantryInput,
  type UpdatePantryInput,
} from "pantry-shared";

import type { Executor } from "../db/client.js";
import { users } from "../db/schema/auth.js";
import { pantries, pantryMembers, pantryNodes } from "../db/schema/pantries.js";
import { toPantry, toUserRef } from "./mappers.js";
import { claimMutation } from "./mutations.js";
import type { ServiceDeps } from "./types.js";

const requirePantry = async (tx: Executor, pantryId: string) => {
  const [row] = await tx
    .select()
    .from(pantries)
    .where(and(eq(pantries.id, pantryId), isNull(pantries.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dispensa inesistente" });
  }
  return row;
};

const memberCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM ${pantryMembers}
  WHERE ${pantryMembers.pantryId} = ${pantries.id}
)`;

const itemCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM ${pantryNodes}
  WHERE ${pantryNodes.pantryId} = ${pantries.id}
    AND ${pantryNodes.kind} = 'item'
    AND ${pantryNodes.deletedAt} IS NULL
)`;

export const listUserPantries = async (
  deps: ServiceDeps,
  userId: string,
): Promise<PantrySummary[]> => {
  const rows = await deps.db
    .select({
      pantry: pantries,
      permissions: pantryMembers.permissions,
      memberCount: memberCountSql,
      itemCount: itemCountSql,
    })
    .from(pantryMembers)
    .innerJoin(pantries, eq(pantries.id, pantryMembers.pantryId))
    .where(and(eq(pantryMembers.userId, userId), isNull(pantries.deletedAt)))
    .orderBy(asc(pantries.name));

  return rows.map((row) => ({
    ...toPantry(row.pantry),
    permissions: row.permissions,
    memberCount: row.memberCount,
    itemCount: row.itemCount,
  }));
};

export const getPantrySummary = async (
  deps: ServiceDeps,
  pantryId: string,
  permissions: number,
): Promise<PantrySummary> => {
  const [row] = await deps.db
    .select({
      pantry: pantries,
      memberCount: memberCountSql,
      itemCount: itemCountSql,
    })
    .from(pantries)
    .where(and(eq(pantries.id, pantryId), isNull(pantries.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dispensa inesistente" });
  }

  return {
    ...toPantry(row.pantry),
    permissions,
    memberCount: row.memberCount,
    itemCount: row.itemCount,
  };
};

export const getPantryDetail = async (
  deps: ServiceDeps,
  pantryId: string,
  permissions: number,
): Promise<PantryDetail> => {
  const summary = await getPantrySummary(deps, pantryId, permissions);

  const members = await deps.db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      permissions: pantryMembers.permissions,
    })
    .from(pantryMembers)
    .innerJoin(users, eq(users.id, pantryMembers.userId))
    .where(eq(pantryMembers.pantryId, pantryId))
    .orderBy(asc(users.displayName));

  return {
    ...summary,
    members: members.map((member) => ({
      user: toUserRef(member),
      permissions: member.permissions,
    })),
  };
};

export const createPantry = async (
  deps: ServiceDeps,
  userId: string,
  input: CreatePantryInput,
): Promise<PantrySummary> => {
  const pantry = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requirePantry(tx, input.id);
    }

    const [created] = await tx
      .insert(pantries)
      .values({ id: input.id, name: input.name, ownerId: userId })
      .onConflictDoNothing({ target: pantries.id })
      .returning();

    if (!created) return requirePantry(tx, input.id);

    await tx
      .insert(pantryMembers)
      .values({ pantryId: created.id, userId, permissions: Role.Owner })
      .onConflictDoNothing();

    return created;
  });

  const dto = toPantry(pantry);
  deps.events.publish({
    type: "pantry.updated",
    pantryId: dto.id,
    pantry: dto,
  });
  return { ...dto, permissions: Role.Owner, memberCount: 1, itemCount: 0 };
};

export const updatePantry = async (
  deps: ServiceDeps,
  userId: string,
  permissions: number,
  input: UpdatePantryInput,
): Promise<PantrySummary> => {
  const pantry = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requirePantry(tx, input.pantryId);
    }

    const [updated] = await tx
      .update(pantries)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(pantries.id, input.pantryId), isNull(pantries.deletedAt)))
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Dispensa inesistente",
      });
    }
    return updated;
  });

  const dto = toPantry(pantry);
  deps.events.publish({
    type: "pantry.updated",
    pantryId: dto.id,
    pantry: dto,
  });
  return getPantrySummary(deps, input.pantryId, permissions);
};

export const deletePantry = async (
  deps: ServiceDeps,
  userId: string,
  input: DeletePantryInput,
): Promise<{ id: string }> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) return;

    const pantry = await requirePantry(tx, input.pantryId);
    if (pantry.ownerId !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Solo il proprietario può eliminare la dispensa",
      });
    }

    await tx
      .update(pantries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pantries.id, input.pantryId));
  });

  deps.events.publish({ type: "pantry.deleted", pantryId: input.pantryId });
  return { id: input.pantryId };
};

export const sharePantry = async (
  deps: ServiceDeps,
  actorId: string,
  permissions: number,
  input: SharePantryInput,
): Promise<PantryDetail> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return;

    const pantry = await requirePantry(tx, input.pantryId);
    if (
      input.userId === pantry.ownerId &&
      !can(input.permissions, Permission.Manage)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Il proprietario deve mantenere la gestione delle condivisioni",
      });
    }

    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Utente inesistente" });
    }

    await tx
      .insert(pantryMembers)
      .values({
        pantryId: input.pantryId,
        userId: input.userId,
        permissions: input.permissions,
      })
      .onConflictDoUpdate({
        target: [pantryMembers.pantryId, pantryMembers.userId],
        set: { permissions: input.permissions },
      });
  });

  return getPantryDetail(deps, input.pantryId, permissions);
};

export const unsharePantry = async (
  deps: ServiceDeps,
  actorId: string,
  permissions: number,
  input: UnsharePantryInput,
): Promise<PantryDetail> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return;

    const pantry = await requirePantry(tx, input.pantryId);
    if (input.userId === pantry.ownerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Il proprietario non può essere rimosso dalla dispensa",
      });
    }

    await tx
      .delete(pantryMembers)
      .where(
        and(
          eq(pantryMembers.pantryId, input.pantryId),
          eq(pantryMembers.userId, input.userId),
        ),
      );
  });

  return getPantryDetail(deps, input.pantryId, permissions);
};
