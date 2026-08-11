import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { pathOf, type PantryAlert, type PantryNode } from "pantry-shared";

import { pantryNodes } from "../db/schema/pantries.js";
import { toPantryNode } from "./mappers.js";
import type { ServiceDeps } from "./types.js";

/**
 * Il percorso leggibile ("Cucina › Scaffale 1 › Biscotti") si ricava dai nodi
 * già in memoria. Una dispensa ha decine di nodi: una seconda query ricorsiva
 * per costruire una stringa sarebbe zelo mal riposto.
 */
const withPaths = (all: PantryNode[], selected: PantryNode[]): PantryAlert[] =>
  selected.map((node) => ({ node, path: pathOf(all, node.id).slice(0, -1) }));

const allNodes = async (
  deps: ServiceDeps,
  pantryId: string,
): Promise<PantryNode[]> => {
  const rows = await deps.db
    .select()
    .from(pantryNodes)
    .where(
      and(eq(pantryNodes.pantryId, pantryId), isNull(pantryNodes.deletedAt)),
    );
  return rows.map(toPantryNode);
};

/**
 * Item sotto la soglia. Senza `min_quantity` non c'è niente da dedurre: il
 * silenzio è meglio di un falso allarme.
 */
export const missingItems = async (
  deps: ServiceDeps,
  pantryId: string,
): Promise<PantryAlert[]> => {
  const rows = await deps.db
    .select()
    .from(pantryNodes)
    .where(
      and(
        eq(pantryNodes.pantryId, pantryId),
        eq(pantryNodes.kind, "item"),
        isNull(pantryNodes.deletedAt),
        isNotNull(pantryNodes.minQuantity),
        sql`COALESCE(${pantryNodes.quantity}, 0) <= ${pantryNodes.minQuantity}`,
      ),
    )
    .orderBy(asc(pantryNodes.name));

  return withPaths(await allNodes(deps, pantryId), rows.map(toPantryNode));
};

/** Item in scadenza entro N giorni, quelli già scaduti compresi. */
export const expiringItems = async (
  deps: ServiceDeps,
  pantryId: string,
  withinDays: number,
): Promise<PantryAlert[]> => {
  const limit = new Date();
  limit.setUTCDate(limit.getUTCDate() + withinDays);
  const limitDate = limit.toISOString().slice(0, 10);

  const rows = await deps.db
    .select()
    .from(pantryNodes)
    .where(
      and(
        eq(pantryNodes.pantryId, pantryId),
        eq(pantryNodes.kind, "item"),
        isNull(pantryNodes.deletedAt),
        isNotNull(pantryNodes.expiresAt),
        lte(pantryNodes.expiresAt, limitDate),
      ),
    )
    .orderBy(asc(pantryNodes.expiresAt));

  return withPaths(await allNodes(deps, pantryId), rows.map(toPantryNode));
};
