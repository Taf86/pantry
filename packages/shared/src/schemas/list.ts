import { z } from "zod";

import { Role } from "../permissions.js";
import {
  entityIdSchema,
  isoDateTimeSchema,
  mutationEnvelope,
  nameSchema,
  permissionsSchema,
  userIdSchema,
} from "./common.js";
import { userRefSchema } from "./user.js";

export const listSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  ownerId: userIdSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type List = z.infer<typeof listSchema>;

/** Lista arricchita con la posizione dell'utente corrente. */
export const listSummarySchema = listSchema.extend({
  permissions: permissionsSchema,
  memberCount: z.number().int().nonnegative(),
  openItemCount: z.number().int().nonnegative(),
});
export type ListSummary = z.infer<typeof listSummarySchema>;

export const listMemberSchema = z.object({
  user: userRefSchema,
  permissions: permissionsSchema,
  createdAt: isoDateTimeSchema,
});
export type ListMember = z.infer<typeof listMemberSchema>;

export const listDetailSchema = listSummarySchema.extend({
  members: z.array(listMemberSchema),
});
export type ListDetail = z.infer<typeof listDetailSchema>;

export const listIdInput = z.object({ listId: entityIdSchema });

export const createListInput = mutationEnvelope.extend({
  id: entityIdSchema,
  name: nameSchema,
});
export type CreateListInput = z.infer<typeof createListInput>;

export const updateListInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  name: nameSchema,
});
export type UpdateListInput = z.infer<typeof updateListInput>;

export const deleteListInput = mutationEnvelope.extend({
  listId: entityIdSchema,
});
export type DeleteListInput = z.infer<typeof deleteListInput>;

export const shareListInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  userId: userIdSchema,
  permissions: permissionsSchema.default(Role.Editor),
});
export type ShareListInput = z.infer<typeof shareListInput>;

export const unshareListInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  userId: userIdSchema,
});
export type UnshareListInput = z.infer<typeof unshareListInput>;
