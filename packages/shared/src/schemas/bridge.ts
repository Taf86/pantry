import { z } from "zod";

import { entityIdSchema, mutationEnvelope } from "./common";
import { listItemSchema } from "./item";
import { pantryNodeSchema } from "./pantry";

/**
 * Il ponte fra le due metà dell'app.
 *
 * Anche qui gli ID nascono nel client: `pantry.toList` e `shopping.toPantry`
 * creano più righe in una sola chiamata, e ognuna deve poter essere ritentata
 * senza duplicarsi. Il client fornisce quindi in anticipo l'ID di destinazione
 * di ogni riga.
 */

export const toListInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  listId: entityIdSchema,
  entries: z
    .array(
      z.object({
        /** Nodo dispensa di origine (sotto soglia o in scadenza). */
        nodeId: entityIdSchema,
        /** ID che avrà l'item creato in lista. */
        itemId: entityIdSchema,
      }),
    )
    .min(1)
    .max(200),
});
export type ToListInput = z.infer<typeof toListInput>;

export const toListResultSchema = z.object({
  created: z.array(listItemSchema),
  /** Nodi saltati perché già presenti in lista come item non spuntato. */
  skipped: z.array(entityIdSchema),
});
export type ToListResult = z.infer<typeof toListResultSchema>;

export const toPantryInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  pantryId: entityIdSchema,
  /** Contenitore di destinazione; `null` = radice della dispensa. */
  parentId: entityIdSchema.nullable(),
  entries: z
    .array(
      z.object({
        /** Item di lista già spuntato. */
        itemId: entityIdSchema,
        /** ID del nodo da creare, se non esiste già un omonimo nel contenitore. */
        nodeId: entityIdSchema,
      }),
    )
    .min(1)
    .max(200),
  /** Rimuove dalla lista gli item riversati (tombstone). */
  clearFromList: z.boolean().default(true),
});
export type ToPantryInput = z.infer<typeof toPantryInput>;

export const toPantryResultSchema = z.object({
  /** Nodi creati o incrementati nella dispensa. */
  nodes: z.array(pantryNodeSchema),
  /** Item di lista saltati perché non spuntati o già rimossi. */
  skipped: z.array(entityIdSchema),
});
export type ToPantryResult = z.infer<typeof toPantryResultSchema>;
