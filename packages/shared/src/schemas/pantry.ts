import { z } from "zod";

import {
  DEFAULT_EXPIRING_WITHIN_DAYS,
  MAX_EXPIRING_WITHIN_DAYS,
} from "../constants";
import { Role } from "../permissions";
import {
  categoryIdSchema,
  entityIdSchema,
  isoDateSchema,
  isoDateTimeSchema,
  mutationEnvelope,
  nameSchema,
  permissionsSchema,
  quantitySchema,
  sortOrderSchema,
  unitSchema,
  userIdSchema,
  versionSchema,
} from "./common";
import { userRefSchema } from "./user";

export const pantrySchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  ownerId: userIdSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Pantry = z.infer<typeof pantrySchema>;

export const pantrySummarySchema = pantrySchema.extend({
  permissions: permissionsSchema,
  memberCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
});
export type PantrySummary = z.infer<typeof pantrySummarySchema>;

export const pantryMemberSchema = z.object({
  user: userRefSchema,
  permissions: permissionsSchema,
});
export type PantryMember = z.infer<typeof pantryMemberSchema>;

export const pantryDetailSchema = pantrySummarySchema.extend({
  members: z.array(pantryMemberSchema),
});
export type PantryDetail = z.infer<typeof pantryDetailSchema>;

export const nodeKindSchema = z.enum(["container", "item"]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

export const pantryNodeSchema = z.object({
  id: entityIdSchema,
  pantryId: entityIdSchema,
  parentId: entityIdSchema.nullable(),
  kind: nodeKindSchema,
  name: z.string(),
  sortOrder: sortOrderSchema,
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  categoryId: categoryIdSchema.nullable(),
  expiresAt: isoDateSchema.nullable(),
  /** Soglia sotto la quale l'item risulta "manca". */
  minQuantity: z.number().nullable(),
  version: versionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
});
export type PantryNode = z.infer<typeof pantryNodeSchema>;

/** Nodo con i figli materializzati: la forma che consuma la UI. */
export type PantryTreeNode = PantryNode & { children: PantryTreeNode[] };

export const pantryIdInput = z.object({ pantryId: entityIdSchema });

export const createPantryInput = mutationEnvelope.extend({
  id: entityIdSchema,
  name: nameSchema,
});
export type CreatePantryInput = z.infer<typeof createPantryInput>;

export const updatePantryInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  name: nameSchema,
});
export type UpdatePantryInput = z.infer<typeof updatePantryInput>;

export const deletePantryInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
});
export type DeletePantryInput = z.infer<typeof deletePantryInput>;

export const sharePantryInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  userId: userIdSchema,
  permissions: permissionsSchema.default(Role.Editor),
});
export type SharePantryInput = z.infer<typeof sharePantryInput>;

export const unsharePantryInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  userId: userIdSchema,
});
export type UnsharePantryInput = z.infer<typeof unsharePantryInput>;

export const createNodeInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  id: entityIdSchema,
  parentId: entityIdSchema.nullish(),
  kind: nodeKindSchema,
  name: nameSchema,
  sortOrder: sortOrderSchema.optional(),
  quantity: quantitySchema.nullish(),
  unit: unitSchema.nullish(),
  categoryId: categoryIdSchema.nullish(),
  expiresAt: isoDateSchema.nullish(),
  minQuantity: quantitySchema.nullish(),
});
export type CreateNodeInput = z.infer<typeof createNodeInput>;

export const updateNodeInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  id: entityIdSchema,
  version: versionSchema,
  name: nameSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
  quantity: quantitySchema.nullish(),
  unit: unitSchema.nullish(),
  categoryId: categoryIdSchema.nullish(),
  expiresAt: isoDateSchema.nullish(),
  minQuantity: quantitySchema.nullish(),
});
export type UpdateNodeInput = z.infer<typeof updateNodeInput>;

export const deleteNodeInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  id: entityIdSchema,
});
export type DeleteNodeInput = z.infer<typeof deleteNodeInput>;

/**
 * Lo spostamento è l'unica operazione con un'invariante strutturale:
 * la destinazione non può essere un discendente del nodo che si muove.
 */
export const moveNodeInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  id: entityIdSchema,
  parentId: entityIdSchema.nullable(),
  sortOrder: sortOrderSchema.optional(),
});
export type MoveNodeInput = z.infer<typeof moveNodeInput>;

/**
 * Consumo: `quantity = quantity - delta` applicato dal database.
 * Un read-modify-write qui sarebbe la race condition da manuale.
 */
export const consumeNodeInput = mutationEnvelope.extend({
  pantryId: entityIdSchema,
  id: entityIdSchema,
  delta: quantitySchema.refine((value) => value > 0, {
    message: "La quantità consumata deve essere positiva",
  }),
});
export type ConsumeNodeInput = z.infer<typeof consumeNodeInput>;

export const missingInput = z.object({ pantryId: entityIdSchema });

export const expiringInput = z.object({
  pantryId: entityIdSchema,
  withinDays: z
    .number()
    .int()
    .min(0)
    .max(MAX_EXPIRING_WITHIN_DAYS)
    .default(DEFAULT_EXPIRING_WITHIN_DAYS),
});

/** Nodo mancante arricchito con il percorso leggibile ("Cucina › Scaffale 1"). */
export const pantryAlertSchema = z.object({
  node: pantryNodeSchema,
  path: z.array(z.string()),
});
export type PantryAlert = z.infer<typeof pantryAlertSchema>;
