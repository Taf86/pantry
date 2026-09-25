import { serializeDates } from "@pantry/shared";
import { asc } from "drizzle-orm";

import { categories } from "../../db/schema/categories.js";
import { authedProcedure, router } from "../trpc.js";

export const categoriesRouter = router({
  /**
   * The global taxonomy. Small, stable and shared, so the client caches it and
   * carries it into the shop; a category is the unit of aisle ordering, and
   * without it offline the merged list would sort at random.
   */
  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id));

    return rows.map(serializeDates);
  }),
});
