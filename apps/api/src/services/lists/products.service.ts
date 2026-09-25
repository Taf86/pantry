import { randomUUID } from "node:crypto";

import {
  MAX_CATALOG_ROWS,
  normalizeProductName,
  serializeDates,
  type Suggestion,
  type UnitCode,
} from "@pantry/shared";
import { desc, eq, sql } from "drizzle-orm";

import type { Database, Executor } from "../../db/client.js";
import { listProducts } from "../../db/schema/list-products.js";
import { products } from "../../db/schema/products.js";

export interface ResolvedProduct {
  id: string;
  /** The list override if there is one, otherwise the catalogue default. */
  categoryId: string | null;
  defaultUnit: UnitCode | null;
}

export interface ResolveArgs {
  name: string;
  quantity: number | null;
  unit: UnitCode | null;
  unitText: string | null;
  /** The writing device's instant, already clamped. */
  at: Date;
}

/**
 * Resolves the catalogue entry behind an item name, and records the usage.
 *
 * Runs INSIDE the caller's transaction and AFTER `claimMutation`. That
 * placement is not incidental: it is the only reason the counters stay exact
 * on replay, because a deduplicated mutation returns before ever reaching
 * here. Move this out of the transaction, or into a post-commit hook, and
 * every retried add inflates the statistics it is supposed to rank by.
 *
 * The client never sends a product id and never receives one. If it created
 * the catalogue row, two people typing "patate" offline would make two
 * products, and deduplicating by name would hand back an id different from
 * the optimistic one — reintroducing exactly the id reconciliation that
 * client-generated ids exist to avoid.
 *
 * NOTE for any future batch path: resolve several products in one transaction
 * only after sorting by normalized name. Two transactions upserting
 * {milk, bread} in opposite orders deadlock on the unique index.
 */
export const resolveProduct = async (
  tx: Executor,
  listId: string,
  args: ResolveArgs,
): Promise<ResolvedProduct | null> => {
  const normalized = normalizeProductName(args.name);
  // A name that normalizes to nothing gets no catalogue row. The item stays
  // perfectly usable with a null product: resolution is an optimisation.
  if (normalized.length === 0) return null;

  // onConflictDoUpdate rather than DoNothing: DoNothing returns no row on
  // conflict, which would cost a second SELECT on by far the common path.
  const [product] = await tx
    .insert(products)
    .values({
      id: randomUUID(),
      normalizedName: normalized,
      displayName: args.name,
      defaultUnit: args.unit,
      usageCount: 1,
    })
    .onConflictDoUpdate({
      target: products.normalizedName,
      set: {
        usageCount: sql`${products.usageCount} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({
      id: products.id,
      categoryId: products.categoryId,
      defaultUnit: products.defaultUnit,
    });

  if (!product) return null;

  const [usage] = await tx
    .insert(listProducts)
    .values({
      listId,
      productId: product.id,
      useCount: 1,
      lastUsedAt: args.at,
      lastQuantity: args.quantity,
      lastUnit: args.unit,
      lastUnitText: args.unitText,
    })
    .onConflictDoUpdate({
      target: [listProducts.listId, listProducts.productId],
      set: {
        useCount: sql`${listProducts.useCount} + 1`,
        // A mutation queued an hour ago must not rewind the statistic, nor
        // overwrite the quantity with the one it was carrying back then.
        lastUsedAt: sql`GREATEST(${listProducts.lastUsedAt}, excluded.last_used_at)`,
        lastQuantity: sql`CASE WHEN excluded.last_used_at >= ${listProducts.lastUsedAt}
          THEN excluded.last_quantity ELSE ${listProducts.lastQuantity} END`,
        lastUnit: sql`CASE WHEN excluded.last_used_at >= ${listProducts.lastUsedAt}
          THEN excluded.last_unit ELSE ${listProducts.lastUnit} END`,
        lastUnitText: sql`CASE WHEN excluded.last_used_at >= ${listProducts.lastUsedAt}
          THEN excluded.last_unit_text ELSE ${listProducts.lastUnitText} END`,
      },
    })
    .returning({ categoryId: listProducts.categoryId });

  return {
    id: product.id,
    categoryId: usage?.categoryId ?? product.categoryId,
    defaultUnit: product.defaultUnit,
  };
};

/**
 * The list's catalogue, shipped whole.
 *
 * Deliberately not a server-side search: the fast path for adding an item has
 * to work between the shelves with no signal, so the client caches these rows
 * and ranks them itself. A few hundred rows of name, unit and category is a
 * few tens of kilobytes, which is a cheap price for suggestions that survive
 * losing the network.
 *
 * `products` itself is never selected here. What leaves the API is usage of
 * lists the caller may read, joined to names — no identifiers.
 */
export const catalogForList = async (
  db: Database,
  listId: string,
): Promise<Suggestion[]> => {
  const rows = await db
    .select({
      name: products.displayName,
      categoryId: sql<
        string | null
      >`COALESCE(${listProducts.categoryId}, ${products.categoryId})`,
      lastQuantity: listProducts.lastQuantity,
      lastUnit: listProducts.lastUnit,
      lastUnitText: listProducts.lastUnitText,
      useCount: listProducts.useCount,
      lastUsedAt: listProducts.lastUsedAt,
    })
    .from(listProducts)
    .innerJoin(products, eq(products.id, listProducts.productId))
    .where(eq(listProducts.listId, listId))
    .orderBy(desc(listProducts.useCount), desc(listProducts.lastUsedAt))
    .limit(MAX_CATALOG_ROWS);

  return rows.map(serializeDates);
};
