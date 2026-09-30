import {
  can,
  MAX_LIST_MEMBERS,
  MAX_LISTS_PER_USER,
  Permission,
  Role,
  serializeDates,
  type CreateListInput,
  type DeleteListInput,
  type FindMemberInput,
  type List,
  type ListMember,
  type ListSummary,
  type RemoveMemberInput,
  type SetMemberInput,
  type UpdateListInput,
  type UserRef,
} from "@pantry/shared";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database, Executor } from "../../db/client.js";
import { listMembers } from "../../db/schema/list-members.js";
import { lists } from "../../db/schema/lists.js";
import type { EventBus } from "../../realtime/events.js";
import { users } from "../../db/schema/users.js";
import { claimMutation } from "./mutations.js";
import { TRPCError } from "@trpc/server";
import { requireListPermission } from "./membership.js";

export const getLists = async (
  deps: ListDeps,
  userId: string,
): Promise<ListSummary[]> => {
  const rows = await deps.db
    .select(listSummarySelection)
    .from(lists)
    .innerJoin(listMembers, asMember(userId))
    .innerJoin(users, eq(lists.createdBy, users.id))
    .where(memberCan(Permission.Read))
    .orderBy(desc(listMembers.permissions), asc(lists.id));

  return rows.map(serializeDates);
};

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
      .where(eq(listMembers.userId, userId));

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

  return requireListSummary(deps.db, userId, input.id);
};

export const getList = async (
  deps: ListDeps,
  userId: string,
  listId: string,
): Promise<List> => {
  return requireList(deps.db, userId, listId);
};

export const updateList = async (
  deps: ListDeps,
  userId: string,
  input: UpdateListInput,
): Promise<List> => {
  const list = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireList(tx, userId, input.listId);
    }

    await updateLockList(tx, input.listId);
    await requireListPermission(
      tx,
      input.listId,
      userId,
      Permission.Write | Permission.Read,
    );

    const [updated] = await tx
      .update(lists)
      .set({ name: input.name })
      .where(eq(lists.id, input.listId))
      .returning(listSelection);

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
    }
    return updated;
  });

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

    await updateLockList(tx, input.listId);
    await requireListPermission(
      tx,
      input.listId,
      userId,
      Permission.Read | Permission.Manage,
    );

    const [row] = await tx
      .delete(lists)
      .where(eq(lists.id, input.listId))
      .returning({ id: lists.id });

    return row !== undefined;
  });

  if (deleted) {
    deps.events.publish({ type: "list.deleted", listId: input.listId });
  }
};

export const getListMembers = async (
  deps: ListDeps,
  listId: string,
  userId: string,
): Promise<ListMember[]> => {
  const rows = await deps.db
    .select({
      listId: lists.id,
      listName: lists.name,
      userId: listMembers.userId,
      permissions: listMembers.permissions,
      userEmail: users.email,
      userDisplayName: users.displayName,
    })
    .from(lists)
    .innerJoin(listMembers, eq(listMembers.listId, lists.id))
    .innerJoin(users, eq(users.id, listMembers.userId))
    .where(eq(lists.id, listId))
    .orderBy(desc(listMembers.permissions), users.displayName);

  const userMembership = rows.find((r) => r.userId === userId);
  if (!userMembership || !can(userMembership.permissions, Permission.Read)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return rows;
};

export const findMemberCandidate = async (
  deps: ListDeps,
  actorId: string,
  input: FindMemberInput,
): Promise<UserRef | null> => {
  await requireListPermission(
    deps.db,
    input.listId,
    actorId,
    Permission.Manage,
  );

  const [row] = await deps.db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(and(eq(users.email, input.email), eq(users.status, "active")))
    .limit(1);

  return row ?? null;
};

export const setMember = async (
  deps: ListDeps,
  actorId: string,
  input: SetMemberInput,
): Promise<ListMember[]> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return;

    await updateLockList(tx, input.listId);

    const members = await tx
      .select({
        userId: listMembers.userId,
        permissions: listMembers.permissions,
      })
      .from(listMembers)
      .where(eq(listMembers.listId, input.listId));

    const membersMap = new Map(
      members.map((row) => [row.userId, row.permissions]),
    );

    if (!can(membersMap.get(actorId), Permission.Manage)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    if (!can(input.permissions, Permission.Read)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Permissions must include Read.",
      });
    }

    if (!membersMap.has(input.userId) && membersMap.size >= MAX_LIST_MEMBERS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Too many members.",
      });
    }

    if (!can(input.permissions, Permission.Manage)) {
      const keepsManager = members.some(
        (m) =>
          m.userId !== input.userId && can(m.permissions, Permission.Manage),
      );
      if (!keepsManager)
        throw new TRPCError({ code: "BAD_REQUEST", message: NO_MANAGER });
    }

    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not existing." });
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
  });

  deps.events.publish({
    type: "list.member.changed",
    listId: input.listId,
    userId: input.userId,
    permissions: input.permissions,
  });
  const members = await getListMembers(deps, input.listId, actorId);
  return members;
};

export const removeMember = async (
  deps: ListDeps,
  actorId: string,
  input: RemoveMemberInput,
) => {
  const { listId, userId, mutationId } = input;

  const removed = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, mutationId, actorId))) return false;

    await updateLockList(tx, listId);
    const required = actorId === userId ? Permission.Read : Permission.Manage;
    await requireListPermission(tx, listId, actorId, required);

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
  deps.events.revoke(listId, userId);
};

interface ListDeps {
  db: Database;
  events: EventBus;
}

const requireList = async (
  db: Executor,
  userId: string,
  listId: string,
): Promise<List> => {
  const [list] = await db
    .select(listSelection)
    .from(lists)
    .innerJoin(listMembers, asMember(userId))
    .where(and(eq(lists.id, listId), memberCan(Permission.Read)))
    .limit(1);

  if (!list) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
  }
  return list;
};

const requireListSummary = async (
  db: Executor,
  userId: string,
  listId: string,
): Promise<ListSummary> => {
  const [list] = await db
    .select(listSummarySelection)
    .from(lists)
    .innerJoin(listMembers, asMember(userId))
    .innerJoin(users, eq(lists.createdBy, users.id))
    .where(and(eq(lists.id, listId), memberCan(Permission.Read)))
    .limit(1);

  if (!list) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not existing." });
  }
  return list;
};

const listSelection = {
  id: lists.id,
  name: lists.name,
};

const listSummarySelection = {
  id: lists.id,
  name: lists.name,
  createdBy: lists.createdBy,
  createdByDisplayName: users.displayName,
  permissions: listMembers.permissions,
};
const asMember = (userId: string) =>
  and(eq(listMembers.listId, lists.id), eq(listMembers.userId, userId));

const memberCan = (required: number) =>
  sql`(${listMembers.permissions} & ${required}) = ${required}`;

const updateLockList = async (tx: Executor, listId: string): Promise<void> => {
  const [row] = await tx
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.id, listId))
    .for("update")
    .limit(1);
  if (!row) throw new TRPCError({ code: "FORBIDDEN" });
};

const assertHasManager = async (
  tx: Executor,
  listId: string,
): Promise<void> => {
  const [managers] = await tx
    .select({ total: count() })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), memberCan(Permission.Manage)));

  if ((managers?.total ?? 0) === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: NO_MANAGER });
  }
};

const NO_MANAGER = "A list must keep at least one member who can manage it.";
