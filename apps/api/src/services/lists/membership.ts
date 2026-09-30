import { and, eq } from "drizzle-orm";

import type { Executor } from "../../db/client.js";
import { listMembers } from "../../db/schema/list-members.js";
import { can } from "@pantry/shared";
import { TRPCError } from "@trpc/server";

export interface Membership {
  permissions: number;
}

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
