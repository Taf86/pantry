import type { ListItem } from "../src/schemas/item.js";
import type { PantryNode } from "../src/schemas/pantry.js";

/** Costruttori di prova: default sensati, override espliciti. */

const NOW = "2026-08-11T10:00:00.000Z";

export const makeItem = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: "00000000-0000-7000-8000-000000000001",
  listId: "00000000-0000-7000-8000-0000000000ff",
  name: "Latte",
  quantity: 1,
  unit: "l",
  categoryId: "latticini",
  note: null,
  checkedAt: null,
  checkedBy: null,
  sortOrder: 0,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  ...overrides,
});

export const makeNode = (overrides: Partial<PantryNode> = {}): PantryNode => ({
  id: "00000000-0000-7000-8000-000000000001",
  pantryId: "00000000-0000-7000-8000-0000000000fe",
  parentId: null,
  kind: "container",
  name: "Armadio",
  sortOrder: 0,
  quantity: null,
  unit: null,
  categoryId: null,
  expiresAt: null,
  minQuantity: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  ...overrides,
});
