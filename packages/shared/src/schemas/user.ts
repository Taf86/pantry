import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "../constants";
import { isoDateTimeSchema, nameSchema, userIdSchema } from "./common";

export const userRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(["invited", "active", "suspended"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  invited: "Invitato",
  active: "Attivo",
  suspended: "Sospeso",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  user: "Utente",
  admin: "Amministratore",
};

/** Utente come lo vede l'utente stesso. */
export const sessionUserSchema = z.object({
  id: userIdSchema,
  email: z.email(),
  displayName: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Utente come lo vede il backoffice. */
export const adminUserSchema = sessionUserSchema.extend({
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema.nullable(),
  hasPendingInvite: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Riferimento leggero a un utente, usato nelle liste di membri. */
export const userRefSchema = z.object({
  id: userIdSchema,
  email: z.email(),
  displayName: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Almeno ${MIN_PASSWORD_LENGTH} caratteri`)
  .max(200);

/** Normalizza prima di validare: "  Mario@Esempio.IT " è un indirizzo valido. */
export const emailInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Indirizzo email non valido"));

export const createUserInput = z.object({
  email: emailInputSchema,
  displayName: nameSchema,
  role: userRoleSchema.default("user"),
});
export type CreateUserInput = z.infer<typeof createUserInput>;

/**
 * Il token in chiaro esiste in un solo momento: la risposta di creazione.
 * In database ne resta solo lo SHA-256.
 */
export const inviteLinkSchema = z.object({
  userId: userIdSchema,
  token: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type InviteLink = z.infer<typeof inviteLinkSchema>;

export const acceptInviteInput = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;

/** Anteprima pubblica di un invito: serve solo a mostrare a chi appartiene. */
export const invitePreviewSchema = z.object({
  email: z.email(),
  displayName: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
