import {
  MAX_LIST_MEMBERS,
  MAX_LISTS_PER_USER,
  Permission,
  Role,
  serializeDates,
  type CreateListInput,
  type DeleteListInput,
  type LeaveListInput,
  type List,
  type ListDetail,
  type ListMember,
  type ListSummary,
  type RemoveMemberInput,
  type SetMemberInput,
  type UpdateListInput,
} from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database, Executor } from "../../db/client.js";
import { listItems } from "../../db/schema/list-items.js";
import { listMembers } from "../../db/schema/list-members.js";
import { lists } from "../../db/schema/lists.js";
import { users } from "../../db/schema/users.js";
import type { EventBus } from "../../realtime/events.js";
import { claimMutation } from "./mutations.js";

export interface ListDeps {
  db: Database;
  events: EventBus;
}

const memberCount = sql<number>`(
  SELECT count(*)::int FROM ${listMembers}
  WHERE ${listMembers.listId} = ${lists.id}
)`;

const openItemCount = sql<number>`(
  SELECT count(*)::int FROM ${listItems}
  WHERE ${listItems.listId} = ${lists.id}
    AND ${listItems.deletedAt} IS NULL
    AND ${listItems.checkedAt} IS NULL
)`;

const listSelection = {
  id: lists.id,
  name: lists.name,
  createdBy: lists.createdBy,
  createdAt: lists.createdAt,
  updatedAt: lists.updatedAt,
  permissions: listMembers.permissions,
  memberCount,
  openItemCount,
};

const asMember = (userId: string) =>
  and(eq(listMembers.listId, lists.id), eq(listMembers.userId, userId));

/** Every list the caller belongs to, most recently touched first. */
export const listLists = async (
  deps: ListDeps,
  userId: string,
): Promise<ListSummary[]> => {
  const rows = await deps.db
    .select(listSelection)
    .from(lists)
    .innerJoin(listMembers, asMember(userId))
    .where(isNull(lists.deletedAt))
    .orderBy(desc(lists.updatedAt));

  return rows.map(serializeDates);
};

export const requireList = async (
  db: Executor,
  listId: string,
): Promise<typeof lists.$inferSelect> => {
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
  }
  return row;
};

const summaryFor = async (
  db: Executor,
  listId: string,
  userId: string,
): Promise<ListSummary> => {
  const [row] = await db
    .select(listSelection)
    .from(lists)
    .innerJoin(listMembers, asMember(userId))
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
  }
  return serializeDates(row);
};

export const listMembersOf = async (
  db: Executor,
  listId: string,
): Promise<ListMember[]> => {
  const rows = await db
    .select({
      permissions: listMembers.permissions,
      createdAt: listMembers.createdAt,
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(listMembers)
    .innerJoin(users, eq(users.id, listMembers.userId))
    .where(eq(listMembers.listId, listId))
    .orderBy(desc(listMembers.permissions), users.displayName);

  return rows.map((row) =>
    serializeDates({
      user: { id: row.id, email: row.email, displayName: row.displayName },
      permissions: row.permissions,
      createdAt: row.createdAt,
    }),
  );
};

export const getList = async (
  deps: ListDeps,
  listId: string,
  userId: string,
): Promise<ListDetail> => ({
  ...(await summaryFor(deps.db, listId, userId)),
  members: await listMembersOf(deps.db, listId),
});

/**
 * Creates a list with its creator as its only manager.
 *
 * `createdBy` records who made it and confers nothing; the membership row is
 * what carries authority, which is why both are written in one transaction.
 */
export const createList = async (
  deps: ListDeps,
  userId: string,
  input: CreateListInput,
): Promise<ListSummary> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) return;

    const [owned] = await tx
      .select({ total: count() })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(and(eq(listMembers.userId, userId), isNull(lists.deletedAt)));

    if ((owned?.total ?? 0) >= MAX_LISTS_PER_USER) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Too many lists." });
    }

    await tx
      .insert(lists)
      .values({ id: input.id, name: input.name, createdBy: userId })
      .onConflictDoNothing();

    await tx
      .insert(listMembers)
      .values({ listId: input.id, userId, permissions: Role.Owner })
      .onConflictDoNothing();
  });

  return summaryFor(deps.db, input.id, userId);
};

export const updateList = async (
  deps: ListDeps,
  userId: string,
  input: UpdateListInput,
): Promise<List> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return await requireList(tx, input.listId);
    }

    const [updated] = await tx
      .update(lists)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(lists.id, input.listId), isNull(lists.deletedAt)))
      .returning();

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
    }
    return updated;
  });

  const list = toList(row);
  deps.events.publish({ type: "list.updated", listId: list.id, list });
  return list;
};

export const deleteList = async (
  deps: ListDeps,
  userId: string,
  input: DeleteListInput,
): Promise<void> => {
  const deleted = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) return false;

    const [row] = await tx
      .update(lists)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(lists.id, input.listId), isNull(lists.deletedAt)))
      .returning({ id: lists.id });

    return row !== undefined;
  });

  if (deleted) {
    deps.events.publish({ type: "list.deleted", listId: input.listId });
  }
};

/**
 * Adds a member, or changes the mask of one already there.
 *
 * The row lock is what makes the "at least one manager" invariant hold under
 * concurrency: two simultaneous demotions would otherwise each see the other
 * manager still in place and both succeed, leaving a list nobody administers.
 */
export const setMember = async (
  deps: ListDeps,
  actorId: string,
  input: SetMemberInput,
): Promise<ListMember[]> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return;

    await lockList(tx, input.listId);
    await requireUserExists(tx, input.userId);

    const present = await tx
      .select({ userId: listMembers.userId })
      .from(listMembers)
      .where(
        and(
          eq(listMembers.listId, input.listId),
          eq(listMembers.userId, input.userId),
        ),
      );

    if (present.length === 0) {
      const [members] = await tx
        .select({ total: count() })
        .from(listMembers)
        .where(eq(listMembers.listId, input.listId));

      if ((members?.total ?? 0) >= MAX_LIST_MEMBERS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Too many members.",
        });
      }
    }

    await tx
      .insert(listMembers)
      .values({
        listId: input.listId,
        userId: input.userId,
        permissions: input.permissions,
        invitedBy: actorId,
      })
      .onConflictDoUpdate({
        target: [listMembers.listId, listMembers.userId],
        set: { permissions: input.permissions },
      });

    await assertHasManager(tx, input.listId);
  });

  deps.events.publish({
    type: "list.member.changed",
    listId: input.listId,
    userId: input.userId,
    permissions: input.permissions,
  });
  return listMembersOf(deps.db, input.listId);
};

export const removeMember = async (
  deps: ListDeps,
  actorId: string,
  input: RemoveMemberInput,
): Promise<ListMember[]> => {
  await dropMember(deps, actorId, input.mutationId, input.listId, input.userId);
  return listMembersOf(deps.db, input.listId);
};

export const leaveList = async (
  deps: ListDeps,
  actorId: string,
  input: LeaveListInput,
): Promise<void> => {
  await dropMember(deps, actorId, input.mutationId, input.listId, actorId);
};

const dropMember = async (
  deps: ListDeps,
  actorId: string,
  mutationId: string,
  listId: string,
  userId: string,
): Promise<void> => {
  const removed = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, mutationId, actorId))) return false;

    await lockList(tx, listId);

    const gone = await tx
      .delete(listMembers)
      .where(
        and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)),
      )
      .returning({ userId: listMembers.userId });

    await assertHasManager(tx, listId);
    return gone.length > 0;
  });

  if (!removed) return;

  deps.events.publish({
    type: "list.member.changed",
    listId,
    userId,
    permissions: null,
  });
  // Publishing alone would not be enough: their socket is still in the room,
  // and would keep receiving items for a list they can no longer read.
  deps.events.revoke(listId, userId);
};

/** Serializes concurrent membership changes on the same list. */
const lockList = async (tx: Executor, listId: string): Promise<void> => {
  const [row] = await tx
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .for("update")
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
  }
};

const assertHasManager = async (
  tx: Executor,
  listId: string,
): Promise<void> => {
  const [managers] = await tx
    .select({ total: count() })
    .from(listMembers)
    .where(
      and(
        eq(listMembers.listId, listId),
        sql`(${listMembers.permissions} & ${Permission.Manage}) = ${Permission.Manage}`,
      ),
    );

  if ((managers?.total ?? 0) === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A list must keep at least one member who can manage it.",
    });
  }
};

const requireUserExists = async (
  tx: Executor,
  userId: string,
): Promise<void> => {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not existing." });
  }
};

const toList = (row: typeof lists.$inferSelect): List =>
  serializeDates({
    id: row.id,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
