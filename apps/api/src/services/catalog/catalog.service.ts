import type { Category, Unit } from "@pantry/shared";
import { asc } from "drizzle-orm";

import type { Executor } from "../../db/client.js";
import { categories, units } from "../../db/schema/catalog.js";

export type Lookups = {
  categories: Category[];
  units: Unit[];
};

export const getLookups = async (deps: { db: Executor }): Promise<Lookups> => {
  const [categoryRows, unitRows] = await Promise.all([
    deps.db.select().from(categories).orderBy(asc(categories.sortOrder)),
    deps.db.select().from(units).orderBy(asc(units.sortOrder)),
  ]);

  return {
    categories: categoryRows as Category[],
    units: unitRows as Unit[],
  };
};
