import z from "zod";
import { passwordSchema } from "./common.js";

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
