import type { Category, ListItem, ShoppingSession } from "@pantry/shared";

let seq = 0;
const id = (): string =>
  `0199a0d0-0000-7000-8000-${String((seq += 1)).padStart(12, "0")}`;

export const aListItem = (overrides: Partial<ListItem> = {}): ListItem => {
  const at = new Date().toISOString();
  return {
    id: id(),
    listId: "0199a0d0-0000-7000-8000-ffffffffffff",
    rawText: "2 kg patate",
    name: "patate",
    quantity: 2,
    unit: "kg",
    unitText: null,
    note: null,
    categoryId: "produce",
    contentUpdatedAt: at,
    checkedAt: null,
    checkedBy: null,
    checkUpdatedAt: at,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
};

export const aCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "produce",
  slug: "produce",
  name: null,
  sortOrder: 100,
  ...overrides,
});

export const aSession = (
  overrides: Partial<ShoppingSession> = {},
): ShoppingSession => ({
  id: id(),
  listId: "0199a0d0-0000-7000-8000-ffffffffffff",
  holder: { id: "marco", email: "marco@example.com", displayName: "Marco" },
  startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  endedAt: null,
  endReason: null,
  ...overrides,
});
