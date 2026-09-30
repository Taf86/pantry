import * as z from "zod";

import {
  entityIdSchema,
  permissionsSchema,
  userIdSchema,
} from "./schemas/common.js";
import { listSchema } from "./schemas/lists.js";

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item.upserted"),
    listId: entityIdSchema,
    // item: listItemSchema,
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
    permissions: permissionsSchema.nullable(),
  }),
  z.object({
    type: z.literal("session.started"),
    listId: entityIdSchema,
    // session: shoppingSessionSchema,
  }),
  z.object({
    type: z.literal("session.ended"),
    listId: entityIdSchema,
    sessionId: entityIdSchema,
    // reason: z.enum(SessionEndReasons),
  }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

export const SERVER_EVENT = "pantry:event" as const;
export const JOIN_EVENT = "pantry:join" as const;
export const LEAVE_EVENT = "pantry:leave" as const;
export const MAX_JOINED_ROOMS = 50;

export const joinPayloadSchema = z.object({
  lists: z.array(entityIdSchema).max(MAX_JOINED_ROOMS).default([]),
});
export type JoinPayload = z.infer<typeof joinPayloadSchema>;
