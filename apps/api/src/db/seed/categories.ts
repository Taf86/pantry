import { sql } from "drizzle-orm";
import { SYSTEM_CATEGORIES } from "@pantry/shared";

import type { Executor } from "../client.js";
import { categories } from "../schema/categories.js";

/**
 * Plants the system taxonomy.
 *
 * Idempotent because a system category uses its slug as its id: re-running it
 * only realigns the aisle order, so it is safe to call on every boot, and it
 * has to be called after every test truncation too or the category foreign
 * keys have nothing to point at.
 */
export const seedCategories = async (db: Executor): Promise<void> => {
  await db
    .insert(categories)
    .values(
      SYSTEM_CATEGORIES.map((category) => ({
        id: category.slug,
        slug: category.slug,
        name: null,
        sortOrder: category.sortOrder,
      })),
    )
    .onConflictDoUpdate({
      target: categories.id,
      set: { sortOrder: sqlExcluded("sort_order") },
    });
};

/**
 * Postgres exposes the row that lost a conflict as `excluded`. Drizzle has no
 * typed accessor for it, so the reference is spelled out.
 */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
