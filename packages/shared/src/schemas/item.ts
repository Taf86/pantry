import { z } from "zod";

import { MAX_CHECK_BATCH } from "../constants";
import {
  categoryIdSchema,
  entityIdSchema,
  isoDateTimeSchema,
  mutationEnvelope,
  nameSchema,
  noteSchema,
  quantitySchema,
  sortOrderSchema,
  unitSchema,
  userIdSchema,
  versionSchema,
} from "./common";

export const listItemSchema = z.object({
  id: entityIdSchema,
  listId: entityIdSchema,
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  categoryId: categoryIdSchema.nullable(),
  note: z.string().nullable(),
  /** `null` = ancora da comprare. */
  checkedAt: isoDateTimeSchema.nullable(),
  checkedBy: userIdSchema.nullable(),
  sortOrder: sortOrderSchema,
  version: versionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Tombstone: mai una DELETE fisica, o un client offline resusciterebbe la riga. */
  deletedAt: isoDateTimeSchema.nullable(),
});
export type ListItem = z.infer<typeof listItemSchema>;

export const addItemInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  id: entityIdSchema,
  name: nameSchema,
  quantity: quantitySchema.nullish(),
  unit: unitSchema.nullish(),
  categoryId: categoryIdSchema.nullish(),
  note: noteSchema.nullish(),
  sortOrder: sortOrderSchema.optional(),
});
export type AddItemInput = z.infer<typeof addItemInput>;

/**
 * La modifica del contenuto passa dal locking ottimistico: senza `version`
 * il lost update è reale (due persone che correggono la quantità).
 */
export const updateItemInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  id: entityIdSchema,
  version: versionSchema,
  name: nameSchema.optional(),
  quantity: quantitySchema.nullish(),
  unit: unitSchema.nullish(),
  categoryId: categoryIdSchema.nullish(),
  note: noteSchema.nullish(),
  sortOrder: sortOrderSchema.optional(),
});
export type UpdateItemInput = z.infer<typeof updateItemInput>;

/**
 * Spunta e de-spunta sono last-write-wins su `checkedAt`: idempotenti,
 * non possono corrompere niente, e quindi non richiedono `version`.
 */
export const checkItemInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  id: entityIdSchema,
  /** Istante in cui la spunta è avvenuta sul dispositivo: è il perno del LWW. */
  checkedAt: isoDateTimeSchema,
});

export type CheckItemInput = z.infer<typeof checkItemInput>;

export const uncheckItemInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  id: entityIdSchema,
  /** Istante della de-spunta, confrontato con `checkedAt` per risolvere il LWW. */
  at: isoDateTimeSchema,
});
export type UncheckItemInput = z.infer<typeof uncheckItemInput>;

export const deleteItemInput = mutationEnvelope.extend({
  listId: entityIdSchema,
  id: entityIdSchema,
});
export type DeleteItemInput = z.infer<typeof deleteItemInput>;

/** Svuotamento della coda offline: molte spunte in un colpo solo. */
export const checkManyInput = mutationEnvelope.extend({
  checks: z
    .array(
      z.object({
        listId: entityIdSchema,
        id: entityIdSchema,
        checkedAt: isoDateTimeSchema.nullable(),
      }),
    )
    .min(1)
    .max(MAX_CHECK_BATCH),
});
export type CheckManyInput = z.infer<typeof checkManyInput>;

export const listItemsInput = z.object({
  listId: entityIdSchema,
  /** Se `true` include i tombstone: serve solo alla riconciliazione offline. */
  includeDeleted: z.boolean().default(false),
});
export type ListItemsInput = z.infer<typeof listItemsInput>;
