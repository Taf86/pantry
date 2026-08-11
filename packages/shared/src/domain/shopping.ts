import { UNCATEGORIZED_SORT_ORDER } from "../constants";
import type { Category } from "../schemas/category";
import type { ListItem } from "../schemas/item";
import type {
  ShoppingEntry,
  ShoppingList,
  ShoppingSession,
} from "../schemas/shopping";

export interface ShoppingGroup {
  categoryId: string | null;
  categoryName: string;
  entries: ShoppingEntry[];
}

const categoryOrderMap = (
  categories: readonly Category[],
): Map<string, number> =>
  new Map(categories.map((category) => [category.id, category.sortOrder]));

const categoryNameMap = (
  categories: readonly Category[],
): Map<string, string> =>
  new Map(categories.map((category) => [category.id, category.name]));

const orderOf = (
  categoryId: string | null,
  order: Map<string, number>,
): number =>
  categoryId === null
    ? UNCATEGORIZED_SORT_ORDER
    : (order.get(categoryId) ?? UNCATEGORIZED_SORT_ORDER);

/** Righe vive di una sessione, con l'etichetta della lista di provenienza. */
export const toEntries = (lists: readonly ShoppingList[]): ShoppingEntry[] =>
  lists.flatMap((list) =>
    list.items
      .filter((item) => item.deletedAt === null)
      .map((item) => ({
        item,
        listId: list.listId,
        listName: list.listName,
      })),
  );

/**
 * Ordina la vista fusa per corsia del supermercato.
 *
 * Nessuna deduplicazione: se il latte è in due liste restano due righe. È la
 * scelta onesta — deduplicare significherebbe decidere per l'utente quale
 * lista aggiornare quando spunta.
 */
export const sortEntries = (
  entries: readonly ShoppingEntry[],
  categories: readonly Category[],
): ShoppingEntry[] => {
  const order = categoryOrderMap(categories);
  return [...entries].sort((a, b) => {
    const checkedDelta =
      Number(a.item.checkedAt !== null) - Number(b.item.checkedAt !== null);
    if (checkedDelta !== 0) return checkedDelta;

    const categoryDelta =
      orderOf(a.item.categoryId, order) - orderOf(b.item.categoryId, order);
    if (categoryDelta !== 0) return categoryDelta;

    return (
      a.item.sortOrder - b.item.sortOrder ||
      a.item.name.localeCompare(b.item.name, "it") ||
      a.listName.localeCompare(b.listName, "it")
    );
  });
};

/** Raggruppa per categoria, mantenendo l'ordine delle corsie. */
export const groupByCategory = (
  entries: readonly ShoppingEntry[],
  categories: readonly Category[],
): ShoppingGroup[] => {
  const names = categoryNameMap(categories);
  const groups = new Map<string, ShoppingGroup>();

  for (const entry of sortEntries(entries, categories)) {
    const key = entry.item.categoryId ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: entry.item.categoryId,
        categoryName: entry.item.categoryId
          ? (names.get(entry.item.categoryId) ?? "Senza categoria")
          : "Senza categoria",
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }

  return [...groups.values()];
};

export const sessionProgress = (
  session: ShoppingSession,
): { total: number; checked: number } => {
  const entries = toEntries(session.lists);
  return {
    total: entries.length,
    checked: entries.filter((entry) => entry.item.checkedAt !== null).length,
  };
};

/** Item spuntati di una lista: l'input naturale di `shopping.toPantry`. */
export const checkedItems = (items: readonly ListItem[]): ListItem[] =>
  items.filter((item) => item.deletedAt === null && item.checkedAt !== null);
