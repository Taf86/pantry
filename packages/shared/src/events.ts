import { z } from "zod";

import { entityIdSchema } from "./schemas/common.js";
import { listItemSchema } from "./schemas/item.js";
import { listSchema } from "./schemas/list.js";
import { pantryNodeSchema, pantrySchema } from "./schemas/pantry.js";

/**
 * Il socket non trasporta mai mutazioni: solo notifiche server→client, che il
 * client usa per aggiornare la cache di TanStack Query. Le scritture passano
 * tutte da tRPC su HTTP, dove ci sono tipi e validazione.
 */
export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item.upserted"),
    listId: entityIdSchema,
    item: listItemSchema,
  }),
  z.object({
    type: z.literal("item.deleted"),
    listId: entityIdSchema,
    itemId: entityIdSchema,
  }),
  z.object({
    type: z.literal("list.updated"),
    listId: entityIdSchema,
    list: listSchema,
  }),
  z.object({
    type: z.literal("list.deleted"),
    listId: entityIdSchema,
  }),
  z.object({
    type: z.literal("pantry.node.upserted"),
    pantryId: entityIdSchema,
    node: pantryNodeSchema,
  }),
  z.object({
    type: z.literal("pantry.node.deleted"),
    pantryId: entityIdSchema,
    nodeId: entityIdSchema,
  }),
  z.object({
    type: z.literal("pantry.updated"),
    pantryId: entityIdSchema,
    pantry: pantrySchema,
  }),
  z.object({
    type: z.literal("pantry.deleted"),
    pantryId: entityIdSchema,
  }),
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;

/** Nome dell'unico evento Socket.IO: il tipo vero sta dentro il payload. */
export const SERVER_EVENT = "pantry:event" as const;

/** Messaggi client→server: solo gestione delle room, mai dati. */
export const JOIN_EVENT = "pantry:join" as const;
export const LEAVE_EVENT = "pantry:leave" as const;

export const joinPayloadSchema = z.object({
  lists: z.array(entityIdSchema).max(50).default([]),
  pantries: z.array(entityIdSchema).max(50).default([]),
});
export type JoinPayload = z.infer<typeof joinPayloadSchema>;
