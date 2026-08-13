import { z } from "zod";

import {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  MAX_UNIT_LENGTH,
} from "../constants.js";
import { ALL_PERMISSIONS } from "../permissions.js";

/**
 * Gli ID delle entità di dominio nascono nel browser come UUID v7.
 * Gli ID degli utenti li genera Better Auth, quindi restano stringhe opache.
 */
export const entityIdSchema = z.uuid();
export const userIdSchema = z.string().min(1).max(64);
export const categoryIdSchema = z.string().min(1).max(64);

/** Identificatore della mutazione, per la deduplica lato server. */
export const mutationIdSchema = z.uuid();

export const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const unitSchema = z.string().trim().min(1).max(MAX_UNIT_LENGTH);
export const noteSchema = z.string().trim().max(MAX_NOTE_LENGTH);

export const quantitySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_QUANTITY);

export const versionSchema = z.number().int().positive();
export const sortOrderSchema = z.number().int().min(0).max(1_000_000);

export const permissionsSchema = z
  .number()
  .int()
  .min(0)
  .max(ALL_PERMISSIONS)
  .refine((value) => (value & ~ALL_PERMISSIONS) === 0, {
    message: "Maschera di permessi non valida",
  });

/** Data-ora serializzata come stringa ISO 8601: nessun trasformatore sul filo. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Data pura (scadenze): `YYYY-MM-DD`, senza fuso orario. */
export const isoDateSchema = z.iso.date();

/**
 * Ogni mutazione porta con sé il proprio identificatore.
 * Senza, un ritentativo della coda offline applicherebbe l'operazione due volte.
 */
export const mutationEnvelope = z.object({ mutationId: mutationIdSchema });

export type MutationEnvelope = z.infer<typeof mutationEnvelope>;

/**
 * Esito di una mutazione deduplicata: il server ha già visto questo
 * `mutationId` e non ha rieseguito nulla.
 */
export const deduplicatedSchema = z.object({ deduplicated: z.literal(true) });

export const okSchema = z.object({ ok: z.literal(true) });
