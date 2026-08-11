import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  ListItem,
  PantryNode,
  ToListInput,
  ToListResult,
  ToPantryInput,
  ToPantryResult,
} from "pantry-shared";

import type { Executor } from "../db/client.js";
import { listItems } from "../db/schema/lists.js";
import { pantryNodes } from "../db/schema/pantries.js";
import { toListItem, toPantryNode } from "./mappers.js";
import { claimMutation } from "./mutations.js";
import type { ServiceDeps } from "./types.js";

/**
 * Il ponte fra le due metà dell'app: la dispensa sa cosa manca, la lista sa
 * cosa è stato comprato.
 *
 * Entrambe le operazioni creano più righe in una sola chiamata, e ognuna deve
 * poter essere ritentata dalla coda offline senza duplicare nulla. Per questo
 * gli ID di destinazione arrivano dal client, esattamente come per le
 * creazioni singole.
 */

const normalize = (name: string): string => name.trim().toLowerCase();

/**
 * Quanto comprare di un prodotto sotto soglia: il divario dalla soglia, con
 * un minimo di uno — perché "manca" e "ne compro zero" non stanno insieme.
 */
export const suggestedQuantity = (
  quantity: number | null,
  minQuantity: number | null,
): number | null => {
  if (minQuantity === null) return null;
  return Math.max(minQuantity - (quantity ?? 0), 1);
};

const itemsByIds = async (tx: Executor, ids: string[]): Promise<ListItem[]> => {
  if (ids.length === 0) return [];
  const rows = await tx
    .select()
    .from(listItems)
    .where(inArray(listItems.id, ids));
  return rows.map(toListItem);
};

const nodesByIds = async (
  tx: Executor,
  ids: string[],
): Promise<PantryNode[]> => {
  if (ids.length === 0) return [];
  const rows = await tx
    .select()
    .from(pantryNodes)
    .where(inArray(pantryNodes.id, ids));
  return rows.map(toPantryNode);
};

/** Genera item di lista dai prodotti mancanti in dispensa. */
export const pantryToList = async (
  deps: ServiceDeps,
  userId: string,
  input: ToListInput,
): Promise<ToListResult> => {
  const result = await deps.db.transaction(
    async (tx): Promise<ToListResult> => {
      if (!(await claimMutation(tx, input.mutationId, userId))) {
        return {
          created: await itemsByIds(
            tx,
            input.entries.map((entry) => entry.itemId),
          ),
          skipped: [],
        };
      }

      const nodes = await tx
        .select()
        .from(pantryNodes)
        .where(
          and(
            inArray(
              pantryNodes.id,
              input.entries.map((entry) => entry.nodeId),
            ),
            eq(pantryNodes.pantryId, input.pantryId),
            eq(pantryNodes.kind, "item"),
            isNull(pantryNodes.deletedAt),
          ),
        );
      const nodeById = new Map(nodes.map((node) => [node.id, node]));

      // Cosa c'è già in lista, per non aggiungere il latte due volte.
      const open = await tx
        .select({ name: listItems.name })
        .from(listItems)
        .where(
          and(
            eq(listItems.listId, input.listId),
            isNull(listItems.deletedAt),
            isNull(listItems.checkedAt),
          ),
        );
      const alreadyThere = new Set(open.map((row) => normalize(row.name)));

      const created: ListItem[] = [];
      const skipped: string[] = [];

      for (const entry of input.entries) {
        const node = nodeById.get(entry.nodeId);
        if (!node || alreadyThere.has(normalize(node.name))) {
          skipped.push(entry.nodeId);
          continue;
        }
        alreadyThere.add(normalize(node.name));

        const [row] = await tx
          .insert(listItems)
          .values({
            id: entry.itemId,
            listId: input.listId,
            name: node.name,
            quantity: suggestedQuantity(node.quantity, node.minQuantity),
            unit: node.unit,
            categoryId: node.categoryId,
          })
          .onConflictDoNothing({ target: listItems.id })
          .returning();

        if (row) created.push(toListItem(row));
        else skipped.push(entry.nodeId);
      }

      return { created, skipped };
    },
  );

  for (const item of result.created) {
    deps.events.publish({ type: "item.upserted", listId: input.listId, item });
  }
  return result;
};

/** Riversa nella dispensa i prodotti spuntati al ritorno dal supermercato. */
export const shoppingToPantry = async (
  deps: ServiceDeps,
  userId: string,
  input: ToPantryInput,
): Promise<ToPantryResult> => {
  const outcome = await deps.db.transaction(
    async (tx): Promise<ToPantryResult & { clearedItemIds: string[] }> => {
      if (!(await claimMutation(tx, input.mutationId, userId))) {
        return {
          nodes: await nodesByIds(
            tx,
            input.entries.map((entry) => entry.nodeId),
          ),
          skipped: [],
          clearedItemIds: [],
        };
      }

      const items = await tx
        .select()
        .from(listItems)
        .where(
          and(
            inArray(
              listItems.id,
              input.entries.map((entry) => entry.itemId),
            ),
            eq(listItems.listId, input.listId),
            isNull(listItems.deletedAt),
          ),
        );
      const itemById = new Map(items.map((item) => [item.id, item]));

      if (input.parentId !== null) {
        const [parent] = await tx
          .select()
          .from(pantryNodes)
          .where(
            and(
              eq(pantryNodes.id, input.parentId),
              eq(pantryNodes.pantryId, input.pantryId),
              isNull(pantryNodes.deletedAt),
            ),
          )
          .limit(1);

        if (!parent || parent.kind !== "container") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Contenitore di destinazione inesistente",
          });
        }
      }

      // Omonimi già presenti nel contenitore: si incrementa, non si duplica.
      const siblings = await tx
        .select()
        .from(pantryNodes)
        .where(
          and(
            eq(pantryNodes.pantryId, input.pantryId),
            input.parentId === null
              ? isNull(pantryNodes.parentId)
              : eq(pantryNodes.parentId, input.parentId),
            eq(pantryNodes.kind, "item"),
            isNull(pantryNodes.deletedAt),
          ),
        );
      const siblingByName = new Map(
        siblings.map((node) => [normalize(node.name), node]),
      );

      const nodes: PantryNode[] = [];
      const skipped: string[] = [];
      const clearedItemIds: string[] = [];

      for (const entry of input.entries) {
        const item = itemById.get(entry.itemId);
        // Solo ciò che è stato davvero comprato finisce in dispensa.
        if (!item || item.checkedAt === null) {
          skipped.push(entry.itemId);
          continue;
        }

        const amount = item.quantity ?? 1;
        const existing = siblingByName.get(normalize(item.name));

        if (existing) {
          const [updated] = await tx
            .update(pantryNodes)
            .set({
              quantity: sql`COALESCE(${pantryNodes.quantity}, 0) + ${amount}`,
              updatedAt: new Date(),
            })
            .where(eq(pantryNodes.id, existing.id))
            .returning();
          if (updated) nodes.push(toPantryNode(updated));
        } else {
          const [created] = await tx
            .insert(pantryNodes)
            .values({
              id: entry.nodeId,
              pantryId: input.pantryId,
              parentId: input.parentId,
              kind: "item",
              name: item.name,
              quantity: amount,
              unit: item.unit,
              categoryId: item.categoryId,
            })
            .onConflictDoNothing({ target: pantryNodes.id })
            .returning();

          if (created) {
            nodes.push(toPantryNode(created));
            siblingByName.set(normalize(created.name), created);
          } else {
            skipped.push(entry.itemId);
            continue;
          }
        }

        clearedItemIds.push(item.id);
      }

      if (input.clearFromList && clearedItemIds.length > 0) {
        await tx
          .update(listItems)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
            version: sql`${listItems.version} + 1`,
          })
          .where(inArray(listItems.id, clearedItemIds));
      }

      return { nodes, skipped, clearedItemIds };
    },
  );

  for (const node of outcome.nodes) {
    deps.events.publish({
      type: "pantry.node.upserted",
      pantryId: input.pantryId,
      node,
    });
  }
  if (input.clearFromList) {
    for (const itemId of outcome.clearedItemIds) {
      deps.events.publish({
        type: "item.deleted",
        listId: input.listId,
        itemId,
      });
    }
  }

  return { nodes: outcome.nodes, skipped: outcome.skipped };
};
