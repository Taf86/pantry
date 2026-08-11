import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Permission, type ShoppingSession } from "pantry-shared";

import { listItems, listMembers, lists } from "../db/schema/lists.js";
import { categories } from "../db/schema/support.js";
import { toCategory, toListItem } from "./mappers.js";
import type { ServiceDeps } from "./types.js";

/**
 * Fan-out sulle liste shoppabili.
 *
 * Il server non sa che esiste una "sessione di spesa": questa procedura
 * esiste perché il client possa precaricare in un colpo solo tutto ciò che gli
 * servirà offline, prima di entrare nel supermercato. La fusione delle liste
 * resta lato client, e ogni scrittura resta indirizzata alla sua lista.
 */
export const getShoppingSession = async (
  deps: ServiceDeps,
  userId: string,
  listIds?: string[],
): Promise<ShoppingSession> => {
  const shoppable = await deps.db
    .select({ id: lists.id, name: lists.name })
    .from(listMembers)
    .innerJoin(lists, eq(lists.id, listMembers.listId))
    .where(
      and(
        eq(listMembers.userId, userId),
        isNull(lists.deletedAt),
        // La maschera deve contenere `Shop`, non solo intersecarlo.
        sql`(${listMembers.permissions} & ${Permission.Shop}) = ${Permission.Shop}`,
        listIds && listIds.length > 0 ? inArray(lists.id, listIds) : undefined,
      ),
    )
    .orderBy(asc(lists.name));

  const ids = shoppable.map((list) => list.id);

  const rows =
    ids.length === 0
      ? []
      : await deps.db
          .select()
          .from(listItems)
          .where(
            and(inArray(listItems.listId, ids), isNull(listItems.deletedAt)),
          )
          .orderBy(asc(listItems.sortOrder), asc(listItems.createdAt));

  const byList = new Map(
    ids.map((id) => [id, [] as ReturnType<typeof toListItem>[]]),
  );
  for (const row of rows) {
    byList.get(row.listId)?.push(toListItem(row));
  }

  const taxonomy = await deps.db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder));

  return {
    lists: shoppable.map((list) => ({
      listId: list.id,
      listName: list.name,
      items: byList.get(list.id) ?? [],
    })),
    categories: taxonomy.map(toCategory),
  };
};

export const listCategories = async (deps: ServiceDeps) => {
  const rows = await deps.db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder));
  return rows.map(toCategory);
};
