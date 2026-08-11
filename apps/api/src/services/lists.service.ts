import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  Permission,
  Role,
  can,
  type CreateListInput,
  type DeleteListInput,
  type ListDetail,
  type ListSummary,
  type ShareListInput,
  type UnshareListInput,
  type UpdateListInput,
} from "pantry-shared";

import type { Executor } from "../db/client.js";
import { users } from "../db/schema/auth.js";
import { listItems, listMembers, lists } from "../db/schema/lists.js";
import { toList, toUserRef } from "./mappers.js";
import { claimMutation } from "./mutations.js";
import type { ServiceDeps } from "./types.js";

const requireList = async (tx: Executor, listId: string) => {
  const [row] = await tx
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lista inesistente" });
  }
  return row;
};

/** Conteggi correlati come sotto-query: una sola andata e ritorno, niente N+1. */
const memberCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM ${listMembers} WHERE ${listMembers.listId} = ${lists.id}
)`;

const openItemCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM ${listItems}
  WHERE ${listItems.listId} = ${lists.id}
    AND ${listItems.deletedAt} IS NULL
    AND ${listItems.checkedAt} IS NULL
)`;

export const listUserLists = async (
  deps: ServiceDeps,
  userId: string,
): Promise<ListSummary[]> => {
  const rows = await deps.db
    .select({
      list: lists,
      permissions: listMembers.permissions,
      memberCount: memberCountSql,
      openItemCount: openItemCountSql,
    })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(and(eq(listMembers.userId, userId), isNull(lists.deletedAt)))
    .orderBy(asc(lists.name));

  return rows.map((row) => ({
    ...toList(row.list),
    permissions: row.permissions,
    memberCount: row.memberCount,
    openItemCount: row.openItemCount,
  }));
};

export const getListSummary = async (
  deps: ServiceDeps,
  listId: string,
  permissions: number,
): Promise<ListSummary> => {
  const [row] = await deps.db
    .select({
      list: lists,
      memberCount: memberCountSql,
      openItemCount: openItemCountSql,
    })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lista inesistente" });
  }

  return {
    ...toList(row.list),
    permissions,
    memberCount: row.memberCount,
    openItemCount: row.openItemCount,
  };
};

export const getListDetail = async (
  deps: ServiceDeps,
  listId: string,
  permissions: number,
): Promise<ListDetail> => {
  const summary = await getListSummary(deps, listId, permissions);

  const members = await deps.db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      permissions: listMembers.permissions,
      createdAt: listMembers.createdAt,
    })
    .from(listMembers)
    .innerJoin(users, eq(users.id, listMembers.userId))
    .where(eq(listMembers.listId, listId))
    .orderBy(asc(users.displayName));

  return {
    ...summary,
    members: members.map((member) => ({
      user: toUserRef(member),
      permissions: member.permissions,
      createdAt: member.createdAt.toISOString(),
    })),
  };
};

export const createList = async (
  deps: ServiceDeps,
  userId: string,
  input: CreateListInput,
): Promise<ListSummary> => {
  const list = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireList(tx, input.id);
    }

    const [created] = await tx
      .insert(lists)
      .values({ id: input.id, name: input.name, ownerId: userId })
      .onConflictDoNothing({ target: lists.id })
      .returning();

    if (!created) return requireList(tx, input.id);

    // Chi crea è proprietario: la membership non è un passo successivo che
    // può fallire per conto suo.
    await tx
      .insert(listMembers)
      .values({ listId: created.id, userId, permissions: Role.Owner })
      .onConflictDoNothing();

    return created;
  });

  const dto = toList(list);
  deps.events.publish({ type: "list.updated", listId: dto.id, list: dto });
  return { ...dto, permissions: Role.Owner, memberCount: 1, openItemCount: 0 };
};

export const updateList = async (
  deps: ServiceDeps,
  userId: string,
  permissions: number,
  input: UpdateListInput,
): Promise<ListSummary> => {
  const list = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireList(tx, input.listId);
    }

    const [updated] = await tx
      .update(lists)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(lists.id, input.listId), isNull(lists.deletedAt)))
      .returning();

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lista inesistente" });
    }
    return updated;
  });

  const dto = toList(list);
  deps.events.publish({ type: "list.updated", listId: dto.id, list: dto });
  return getListSummary(deps, input.listId, permissions);
};

export const deleteList = async (
  deps: ServiceDeps,
  userId: string,
  input: DeleteListInput,
): Promise<{ id: string }> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) return;

    const list = await requireList(tx, input.listId);
    // Eliminare una lista la toglie a tutti i membri: la può sopprimere solo
    // chi la possiede, non chiunque abbia `Manage`.
    if (list.ownerId !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Solo il proprietario può eliminare la lista",
      });
    }

    await tx
      .update(lists)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(lists.id, input.listId));
  });

  deps.events.publish({ type: "list.deleted", listId: input.listId });
  return { id: input.listId };
};

export const shareList = async (
  deps: ServiceDeps,
  actorId: string,
  permissions: number,
  input: ShareListInput,
): Promise<ListDetail> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return;

    const list = await requireList(tx, input.listId);

    // Il proprietario non può essere retrocesso, o resterebbe una lista che
    // nessuno può più amministrare.
    if (
      input.userId === list.ownerId &&
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
      .insert(listMembers)
      .values({
        listId: input.listId,
        userId: input.userId,
        permissions: input.permissions,
      })
      .onConflictDoUpdate({
        target: [listMembers.listId, listMembers.userId],
        set: { permissions: input.permissions },
      });
  });

  return getListDetail(deps, input.listId, permissions);
};

export const unshareList = async (
  deps: ServiceDeps,
  actorId: string,
  permissions: number,
  input: UnshareListInput,
): Promise<ListDetail> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return;

    const list = await requireList(tx, input.listId);
    if (input.userId === list.ownerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Il proprietario non può essere rimosso dalla lista",
      });
    }

    await tx
      .delete(listMembers)
      .where(
        and(
          eq(listMembers.listId, input.listId),
          eq(listMembers.userId, input.userId),
        ),
      );
  });

  return getListDetail(deps, input.listId, permissions);
};
