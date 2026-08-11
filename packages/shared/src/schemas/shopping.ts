import { z } from "zod";

import { entityIdSchema } from "./common";
import { categorySchema } from "./category";
import { listItemSchema } from "./item";

/**
 * Una sessione di spesa non esiste lato server: è una fusione lato client di
 * più liste. Questa procedura fa solo il fan-out sulle liste su cui l'utente
 * ha il permesso `Shop`, così il client può precaricarle in un colpo solo
 * prima di entrare nel supermercato.
 */
export const shoppingSessionInput = z.object({
  /** Se omesso, tutte le liste shoppabili dall'utente. */
  listIds: z.array(entityIdSchema).max(50).optional(),
});

export const shoppingListSchema = z.object({
  listId: entityIdSchema,
  listName: z.string(),
  items: z.array(listItemSchema),
});
export type ShoppingList = z.infer<typeof shoppingListSchema>;

export const shoppingSessionSchema = z.object({
  lists: z.array(shoppingListSchema),
  categories: z.array(categorySchema),
});
export type ShoppingSession = z.infer<typeof shoppingSessionSchema>;

/**
 * Riga della vista fusa. I duplicati non si deduplicano: se il latte è in due
 * liste si mostrano due righe etichettate con la lista di origine. Semplice
 * batte furbo, e la semantica resta onesta.
 */
export interface ShoppingEntry {
  item: z.infer<typeof listItemSchema>;
  listId: string;
  listName: string;
}
