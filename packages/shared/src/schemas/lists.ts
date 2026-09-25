import z from "zod";

import { Role } from "../permissions.js";
import {
  entityIdSchema,
  isoDateTimeSchema,
  mutationEnvelope,
  nameSchema,
  permissionsSchema,
  userIdSchema,
} from "./common.js";
import { userRefSchema } from "./users.js";

export const listSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  /**
   * Provenance only, and deliberately so: authorization lives entirely in
   * `list_members`. Two sources of truth for "who may manage this" is how you
   * end up with a list nobody can administer.
   */
  createdBy: userIdSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type List = z.infer<typeof listSchema>;

/** A list as it appears in the index, with the caller's own standing. */
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

export const listIdInputSchema = z.object({ listId: entityIdSchema });
export type ListIdInput = z.infer<typeof listIdInputSchema>;

export const createListInputSchema = mutationEnvelope.extend({
  id: entityIdSchema,
  name: nameSchema,
});
export type CreateListInput = z.infer<typeof createListInputSchema>;

export const updateListInputSchema = mutationEnvelope.extend({
  listId: entityIdSchema,
  name: nameSchema,
});
export type UpdateListInput = z.infer<typeof updateListInputSchema>;

export const deleteListInputSchema = mutationEnvelope.extend({
  listId: entityIdSchema,
});
export type DeleteListInput = z.infer<typeof deleteListInputSchema>;

export const setMemberInputSchema = mutationEnvelope.extend({
  listId: entityIdSchema,
  userId: userIdSchema,
  permissions: permissionsSchema.default(Role.Editor),
});
export type SetMemberInput = z.infer<typeof setMemberInputSchema>;

export const removeMemberInputSchema = mutationEnvelope.extend({
  listId: entityIdSchema,
  userId: userIdSchema,
});
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;

export const leaveListInputSchema = mutationEnvelope.extend({
  listId: entityIdSchema,
});
export type LeaveListInput = z.infer<typeof leaveListInputSchema>;
