import z from "zod";
import {
  DEFAULT_PAGINATION,
  paginationSchema,
  passwordSchema,
  type Page,
} from "./common.js";
import type { UserRef, UserStatus } from "./users.js";

export type InviteLink = {
  userId: string;
  token: string;
  expiresAt: string;
};

export type InvitePreview = {
  email: string;
  displayName: string;
  expiresAt: string;
};

export const previewInviteInputSchema = z.object({
  token: z.string().min(16).max(256),
});
export type PreviewInviteInput = z.infer<typeof previewInviteInputSchema>;

export const acceptInviteInputSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;

/** The invite as the admin list shows it: never the token, only who and when. */
export type InviteExtended = {
  id: string;
  user: UserRef & { status: UserStatus };
  createdBy: UserRef;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export const InviteSortFields = [
  "user",
  "usedAt",
  "expiresAt",
  "createdBy",
] as const;
export type InviteSortField = (typeof InviteSortFields)[number];
export const inviteSortFieldSchema = z.enum(InviteSortFields);

export const inviteSortSchema = z.object({
  id: inviteSortFieldSchema,
  desc: z.boolean(),
});
export type InviteSort = z.infer<typeof inviteSortSchema>;

export const listInvitesInputSchema = z.object({
  pagination: paginationSchema.default(DEFAULT_PAGINATION),
  sorting: z.array(inviteSortSchema).max(InviteSortFields.length).default([]),
});
export type ListInvitesInput = z.infer<typeof listInvitesInputSchema>;
export type ListInvitesResult = Page<InviteExtended>;

export const inviteIdInputSchema = z.object({
  inviteId: z.uuid(),
});
export type InviteIdInput = z.infer<typeof inviteIdInputSchema>;
