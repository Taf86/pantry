import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { can } from "pantry-shared";

import type { Executor } from "../db/client.js";
import { listMembers, lists } from "../db/schema/lists.js";
import { pantries, pantryMembers } from "../db/schema/pantries.js";

export interface Membership {
  permissions: number;
}

/**
 * Risolve la membership una volta sola, per il middleware tRPC.
 *
 * La join con la lista non è un vezzo: una lista cancellata non deve
 * concedere permessi, e senza la join il tombstone resterebbe invisibile
 * all'autorizzazione.
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

/**
 * Verifica in blocco i permessi su più liste.
 *
 * Serve alle operazioni che attraversano più liste — lo svuotamento della coda
 * offline, il ponte con la dispensa — dove un controllo per lista sarebbe una
 * query per lista e, peggio, un punto in cui è facile dimenticarsene una.
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
      message: `Permessi insufficienti su ${denied.length} lista/e`,
    });
  }
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

export const requirePantryPermission = async (
  db: Executor,
  pantryId: string,
  userId: string,
  required: number,
): Promise<number> => {
  const membership = await getPantryMembership(db, pantryId, userId);
  if (!membership || !can(membership.permissions, required)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return membership.permissions;
};

export const getPantryMembership = async (
  db: Executor,
  pantryId: string,
  userId: string,
): Promise<Membership | null> => {
  const [row] = await db
    .select({ permissions: pantryMembers.permissions })
    .from(pantryMembers)
    .innerJoin(pantries, eq(pantries.id, pantryMembers.pantryId))
    .where(
      and(
        eq(pantryMembers.pantryId, pantryId),
        eq(pantryMembers.userId, userId),
        isNull(pantries.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
};
