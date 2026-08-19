import { z } from "zod";

import { MAX_CONTACT_LENGTH } from "../constants.js";
import { isoDateTimeSchema, nameSchema, userIdSchema } from "./common.js";
import { emailInputSchema } from "./user.js";

/**
 * Richiesta di registrazione.
 *
 * Non è un utente a metà: vive in una tabella propria e non ha né credenziali
 * né sessione. L'approvazione la trasforma in un utente `unactivated` con il
 * consueto link di attivazione (§5).
 */
export const signupRequestIdSchema = z.uuid();

export const signupRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);
export type SignupRequestStatus = z.infer<typeof signupRequestStatusSchema>;

export const SIGNUP_REQUEST_STATUS_LABELS: Record<SignupRequestStatus, string> =
  {
    pending: "In attesa",
    approved: "Approvata",
    rejected: "Rifiutata",
  };

/**
 * Il contatto è obbligatorio, e non è un campo di cortesia: senza email da
 * spedire, è l'unico modo che ha l'amministratore di consegnare il link di
 * attivazione a chi lo ha chiesto.
 */
export const signupRequestInput = z.object({
  email: emailInputSchema,
  displayName: nameSchema,
  contact: z.string().trim().min(1).max(MAX_CONTACT_LENGTH),
  /** Richiesto solo se l'istanza ha configurato un codice di registrazione. */
  code: z.string().trim().max(200).optional(),
});
export type SignupRequestInput = z.infer<typeof signupRequestInput>;

/** Richiesta come la vede il backoffice. */
export const signupRequestSchema = z.object({
  id: signupRequestIdSchema,
  email: z.email(),
  displayName: z.string(),
  contact: z.string(),
  status: signupRequestStatusSchema,
  createdAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable(),
  decidedBy: userIdSchema.nullable(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/**
 * Ciò che la pagina di login ha bisogno di sapere prima di offrire il modulo:
 * se la porta è aperta, e se serve un codice.
 */
export const signupInfoSchema = z.object({
  open: z.boolean(),
  requiresCode: z.boolean(),
});
export type SignupInfo = z.infer<typeof signupInfoSchema>;
