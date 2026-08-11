import type { ListItem, PantryNode, ShoppingSession } from "pantry-shared";

const NOW = "2026-08-11T10:00:00.000Z";

export const LIST_ID = "01930d1e-0000-7000-8000-0000000000aa";
export const OTHER_LIST_ID = "01930d1e-0000-7000-8000-0000000000ab";
export const PANTRY_ID = "01930d1e-0000-7000-8000-0000000000bb";

export const makeItem = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: "01930d1e-0000-7000-8000-000000000001",
  listId: LIST_ID,
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
  id: "01930d1e-0000-7000-8000-000000000002",
  pantryId: PANTRY_ID,
  parentId: null,
  kind: "item",
  name: "Biscotti",
  sortOrder: 0,
  quantity: 3,
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

export const makeSession = (
  overrides: Partial<ShoppingSession> = {},
): ShoppingSession => ({
  lists: [
    { listId: LIST_ID, listName: "Casa", items: [makeItem()] },
    { listId: OTHER_LIST_ID, listName: "Ufficio", items: [] },
  ],
  categories: [{ id: "latticini", name: "Latticini", sortOrder: 40 }],
  ...overrides,
});
