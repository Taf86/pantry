import * as z from "zod";
import {
  emailSchema,
  entityIdSchema,
  grantablePermissionsSchema,
  mutationSchema,
  nameSchema,
  userIdSchema,
} from "./common.js";
import { Role } from "../permissions.js";

export const listSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
});
export type List = z.infer<typeof listSchema>;

export type ListSummary = List & {
  createdBy: string;
  createdByDisplayName: string;
  permissions: number;
};

export const createListInputSchema = mutationSchema.extend({
  id: entityIdSchema,
  name: nameSchema,
});
export type CreateListInput = z.infer<typeof createListInputSchema>;

export const updateListInputSchema = mutationSchema.extend({
  listId: entityIdSchema,
  name: nameSchema,
});
export type UpdateListInput = z.infer<typeof updateListInputSchema>;

export const deleteListInputSchema = mutationSchema.extend({
  listId: entityIdSchema,
});
export type DeleteListInput = z.infer<typeof deleteListInputSchema>;

export type ListMember = {
  listId: string;
  listName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  permissions: number;
};

export const listIdInputSchema = z.object({ listId: entityIdSchema });
export type ListIdInput = z.infer<typeof listIdInputSchema>;

export const findMemberInputSchema = z.object({
  listId: entityIdSchema,
  email: emailSchema,
});
export type FindMemberInput = z.infer<typeof findMemberInputSchema>;

export const setMemberInputSchema = mutationSchema.extend({
  listId: entityIdSchema,
  userId: userIdSchema,
  permissions: grantablePermissionsSchema.default(Role.Shopper),
});
export type SetMemberInput = z.infer<typeof setMemberInputSchema>;

export const removeMemberInputSchema = mutationSchema.extend({
  listId: entityIdSchema,
  userId: userIdSchema,
});
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;
