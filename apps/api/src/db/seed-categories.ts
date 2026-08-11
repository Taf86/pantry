import { sql } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "pantry-shared";

import type { Executor } from "./client.js";
import { categories } from "./schema/support.js";

/** `excluded.<colonna>`: il valore che l'INSERT avrebbe scritto. */
const excluded = (column: string) => sql.raw(`excluded.${column}`);

/**
 * La tassonomia di partenza è dato di riferimento, non dato utente: la si
 * riallinea a ogni avvio. L'upsert permette di correggere nomi e ordinamento
 * con un deploy, senza toccare gli item che vi puntano.
 */
export const seedCategories = async (db: Executor): Promise<void> => {
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
      })),
    )
    .onConflictDoUpdate({
      target: categories.id,
      set: { name: excluded("name"), sortOrder: excluded("sort_order") },
    });
};
