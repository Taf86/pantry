import z from "zod";

import {
  entityIdSchema,
  permissionsSchema,
  userIdSchema,
} from "./schemas/common.js";
import { listItemSchema } from "./schemas/items.js";
import { listSchema } from "./schemas/lists.js";
import {
  SessionEndReasons,
  shoppingSessionSchema,
} from "./schemas/shopping.js";

/**
 * The socket carries notifications, never mutations.
 *
 * Writes all go through tRPC over HTTP, where there are types and validation
 * on the critical path; the socket exists for one reason only, which is
 * reconnection with backoff on a flaky mobile network. That is literally the
 * supermarket scenario.
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
    type: z.literal("list.member.changed"),
    listId: entityIdSchema,
    userId: userIdSchema,
    /** `null` means the member was removed. */
    permissions: permissionsSchema.nullable(),
  }),
  z.object({
    type: z.literal("session.started"),
    listId: entityIdSchema,
    session: shoppingSessionSchema,
  }),
  z.object({
    type: z.literal("session.ended"),
    listId: entityIdSchema,
    sessionId: entityIdSchema,
    reason: z.enum(SessionEndReasons),
  }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

/** The only Socket.IO event name: the real type lives inside the payload. */
export const SERVER_EVENT = "pantry:event" as const;

/** Client to server: room management only, never data. */
export const JOIN_EVENT = "pantry:join" as const;
export const LEAVE_EVENT = "pantry:leave" as const;

/**
 * The cap is not decoration: an oversized join is rejected whole, so a client
 * that forgets to slice silently stops receiving anything at all.
 */
export const MAX_JOINED_ROOMS = 50;

export const joinPayloadSchema = z.object({
  lists: z.array(entityIdSchema).max(MAX_JOINED_ROOMS).default([]),
});
export type JoinPayload = z.infer<typeof joinPayloadSchema>;
