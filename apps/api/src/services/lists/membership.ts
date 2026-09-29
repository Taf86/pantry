import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
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
 * No join on `lists` is needed to know the list still exists: `list_members`
 * cascades from it, so a membership row cannot outlive the list it is about.
 */
export const getListMembership = async (
  db: Executor,
  listId: string,
  userId: string,
): Promise<Membership | null> => {
  const [row] = await db
    .select({ permissions: listMembers.permissions })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
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
 * `requireListPermission` for a transaction about to write on the strength of
 * the answer.
 *
 * Every change to who may do what (setting or dropping a member, deleting the
 * list) holds the list row FOR UPDATE. Taking it FOR SHARE here means a
 * revocation either committed before we read the mask, or waits for us to
 * finish: nobody writes on a grant that has already been withdrawn.
 *
 * The lock goes on the list, not on the membership row. Deleting a list
 * cascades onto the membership rows while writers hold key-share locks on the
 * list through their foreign keys; locking the membership as well would give
 * the two a cycle to deadlock on.
 *
 * The mask is read in a second statement on purpose: under READ COMMITTED a
 * statement that waited for a lock still sees the snapshot it started with.
 *
 * A caller about to update the list row itself locks it FOR UPDATE first and
 * uses `requireListPermission`: two transactions upgrading a share lock to an
 * exclusive one deadlock.
 */
export const lockListPermission = async (
  tx: Executor,
  listId: string,
  userId: string,
  required: number,
): Promise<number> => {
  const [row] = await tx
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.id, listId))
    .for("share")
    .limit(1);

  // Answers a missing list like a forbidden one, as the tRPC middleware does.
  if (!row) throw new TRPCError({ code: "FORBIDDEN" });
  return requireListPermission(tx, listId, userId, required);
};

/**
 * Checks permissions across several lists at once, locking them as
 * `lockListPermission` does.
 *
 * Needed by the operations that span lists, such as draining the offline queue
 * with a batch of ticks. A per-list check would be a query per list and, worse,
 * a place where it is easy to forget one. The locks are taken in id order, so
 * two batches over overlapping lists cannot wait on each other in a circle.
 */
export const assertListPermissions = async (
  db: Executor,
  listIds: readonly string[],
  userId: string,
  required: number,
): Promise<void> => {
  const unique = [...new Set(listIds)];
  if (unique.length === 0) return;

  await db
    .select({ id: lists.id })
    .from(lists)
    .where(inArray(lists.id, unique))
    .orderBy(asc(lists.id))
    .for("share");

  const rows = await db
    .select({
      listId: listMembers.listId,
      permissions: listMembers.permissions,
    })
    .from(listMembers)
    .where(
      and(inArray(listMembers.listId, unique), eq(listMembers.userId, userId)),
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
