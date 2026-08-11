import type {
  Category,
  List,
  ListItem,
  Pantry,
  PantryNode,
  UserRef,
} from "pantry-shared";

import type { categories } from "../db/schema/support.js";
import type { listItems, lists } from "../db/schema/lists.js";
import type { pantries, pantryNodes } from "../db/schema/pantries.js";
import type { users } from "../db/schema/auth.js";

type ListRow = typeof lists.$inferSelect;
type ListItemRow = typeof listItems.$inferSelect;
type PantryRow = typeof pantries.$inferSelect;
type PantryNodeRow = typeof pantryNodes.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type UserRow = typeof users.$inferSelect;

/**
 * I DTO viaggiano con date in ISO 8601, non con oggetti `Date`.
 *
 * Senza un trasformatore sul filo, un `Date` diventerebbe comunque una stringa
 * durante la serializzazione mentre il tipo continuerebbe a dire `Date`: una
 * bugia che il client scopre solo a runtime. Peggio, la cache persistita in
 * IndexedDB rileggerebbe stringhe dove il codice si aspetta date.
 */
const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export const toList = (row: ListRow): List => ({
  id: row.id,
  name: row.name,
  ownerId: row.ownerId,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export const toListItem = (row: ListItemRow): ListItem => ({
  id: row.id,
  listId: row.listId,
  name: row.name,
  quantity: row.quantity,
  unit: row.unit,
  categoryId: row.categoryId,
  note: row.note,
  checkedAt: isoOrNull(row.checkedAt),
  checkedBy: row.checkedBy,
  sortOrder: row.sortOrder,
  version: row.version,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
});

export const toPantry = (row: PantryRow): Pantry => ({
  id: row.id,
  name: row.name,
  ownerId: row.ownerId,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

export const toPantryNode = (row: PantryNodeRow): PantryNode => ({
  id: row.id,
  pantryId: row.pantryId,
  parentId: row.parentId,
  kind: row.kind === "item" ? "item" : "container",
  name: row.name,
  sortOrder: row.sortOrder,
  quantity: row.quantity,
  unit: row.unit,
  categoryId: row.categoryId,
  expiresAt: row.expiresAt,
  minQuantity: row.minQuantity,
  version: row.version,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
});

export const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sortOrder,
});

export const toUserRef = (
  row: Pick<UserRow, "id" | "email" | "displayName">,
): UserRef => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
});
