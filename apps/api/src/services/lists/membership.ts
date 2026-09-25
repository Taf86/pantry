import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { can } from "@pantry/shared";

import type { Executor } from "../../db/client.js";
import { listMembers } from "../../db/schema/list-members.js";
import { lists } from "../../db/schema/lists.js";

export interface Membership {
  permissions: number;
}

/**
 * Resolves a membership once, for the tRPC middleware.
 *
 * The join on `lists` is not decoration: a soft-deleted list must grant
 * nothing to anybody, and without it the tombstone would be invisible to
 * authorization.
 */
export const getListMembership = async (
  db: Executor,
  listId: string,
  userId: string,
): Promise<Membership | null> => {
  const [row] = await db
    .select({ permissions: listMembers.permissions })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(
      and(
        eq(listMembers.listId, listId),
        eq(listMembers.userId, userId),
        isNull(lists.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
};

export const requireListPermission = async (
  db: Executor,
  listId: string,
  userId: string,
  required: number,
): Promise<number> => {
  const membership = await getListMembership(db, listId, userId);
  if (!membership || !can(membership.permissions, required)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return membership.permissions;
};

/**
 * Checks permissions across several lists at once.
 *
 * Needed by the operations that span lists, such as draining the offline queue
 * with a batch of ticks. A per-list check would be a query per list and, worse,
 * a place where it is easy to forget one.
 */
export const assertListPermissions = async (
  db: Executor,
  listIds: readonly string[],
  userId: string,
  required: number,
): Promise<void> => {
  const unique = [...new Set(listIds)];
  if (unique.length === 0) return;

  const rows = await db
    .select({
      listId: listMembers.listId,
      permissions: listMembers.permissions,
    })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(
      and(
        inArray(listMembers.listId, unique),
        eq(listMembers.userId, userId),
        isNull(lists.deletedAt),
      ),
    );

  const granted = new Map(rows.map((row) => [row.listId, row.permissions]));
  const denied = unique.filter((id) => !can(granted.get(id) ?? 0, required));

  if (denied.length > 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient permissions on ${String(denied.length)} list(s).`,
    });
  }
};
