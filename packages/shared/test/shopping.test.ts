import { describe, expect, it } from "vitest";

import {
  checkedItems,
  groupByCategory,
  sessionProgress,
  sortEntries,
  toEntries,
} from "../src/domain/shopping.js";
import type { Category } from "../src/schemas/category.js";
import type { ShoppingList } from "../src/schemas/shopping.js";
import { makeItem } from "./factories.js";

const categories: Category[] = [
  { id: "ortofrutta", name: "Ortofrutta", sortOrder: 10 },
  { id: "latticini", name: "Latticini", sortOrder: 40 },
  { id: "bevande", name: "Bevande", sortOrder: 90 },
];

const casa: ShoppingList = {
  listId: "00000000-0000-7000-8000-00000000000a",
  listName: "Casa",
  items: [
    makeItem({ id: "i1", name: "Latte", categoryId: "latticini" }),
    makeItem({ id: "i2", name: "Mele", categoryId: "ortofrutta" }),
    makeItem({
      id: "i3",
      name: "Pane",
      categoryId: null,
      deletedAt: "2026-08-11T09:00:00.000Z",
    }),
  ],
};

const ufficio: ShoppingList = {
  listId: "00000000-0000-7000-8000-00000000000b",
  listName: "Ufficio",
  items: [
    makeItem({ id: "i4", name: "Latte", categoryId: "latticini" }),
    makeItem({ id: "i5", name: "Acqua", categoryId: "bevande" }),
  ],
};

describe("toEntries", () => {
  it("etichetta ogni riga con la lista di origine", () => {
    const entries = toEntries([casa, ufficio]);
    expect(entries.map((entry) => entry.listName)).toEqual([
      "Casa",
      "Casa",
      "Ufficio",
      "Ufficio",
    ]);
  });

  it("scarta i tombstone", () => {
    expect(toEntries([casa]).map((entry) => entry.item.id)).toEqual([
      "i1",
      "i2",
    ]);
  });
});

describe("sortEntries", () => {
  it("ordina per corsia del supermercato, non per lista", () => {
    const sorted = sortEntries(toEntries([casa, ufficio]), categories);
    expect(sorted.map((entry) => entry.item.name)).toEqual([
      "Mele",
      "Latte",
      "Latte",
      "Acqua",
    ]);
  });

  it("non deduplica gli omonimi presenti in liste diverse", () => {
    const sorted = sortEntries(toEntries([casa, ufficio]), categories);
    const latte = sorted.filter((entry) => entry.item.name === "Latte");
    expect(latte.map((entry) => entry.listName)).toEqual(["Casa", "Ufficio"]);
  });

  it("spinge in fondo gli item già spuntati", () => {
    const entries = toEntries([
      {
        ...casa,
        items: [
          makeItem({
            id: "i1",
            name: "Mele",
            categoryId: "ortofrutta",
            checkedAt: "2026-08-11T10:30:00.000Z",
          }),
          makeItem({ id: "i2", name: "Acqua", categoryId: "bevande" }),
        ],
      },
    ]);
    expect(sortEntries(entries, categories).map((e) => e.item.name)).toEqual([
      "Acqua",
      "Mele",
    ]);
  });

  it("mette in coda gli item senza categoria", () => {
    const entries = toEntries([
      {
        ...casa,
        items: [
          makeItem({ id: "i1", name: "Sconosciuto", categoryId: null }),
          makeItem({ id: "i2", name: "Acqua", categoryId: "bevande" }),
        ],
      },
    ]);
    expect(sortEntries(entries, categories).map((e) => e.item.name)).toEqual([
      "Acqua",
      "Sconosciuto",
    ]);
  });

  it("non muta l'array in ingresso", () => {
    const entries = toEntries([casa, ufficio]);
    const snapshot = entries.map((entry) => entry.item.id);
    sortEntries(entries, categories);
    expect(entries.map((entry) => entry.item.id)).toEqual(snapshot);
  });
});

describe("groupByCategory", () => {
  it("raggruppa mantenendo l'ordine delle corsie", () => {
    const groups = groupByCategory(toEntries([casa, ufficio]), categories);
    expect(groups.map((group) => group.categoryName)).toEqual([
      "Ortofrutta",
      "Latticini",
      "Bevande",
    ]);
    expect(groups[1]!.entries).toHaveLength(2);
  });

  it("etichetta il gruppo senza categoria", () => {
    const entries = toEntries([
      { ...casa, items: [makeItem({ id: "i9", categoryId: null })] },
    ]);
    expect(groupByCategory(entries, categories)[0]!.categoryName).toBe(
      "Senza categoria",
    );
  });
});

describe("sessionProgress", () => {
  it("conta solo le righe vive", () => {
    const progress = sessionProgress({
      lists: [casa, ufficio],
      categories,
    });
    expect(progress).toEqual({ total: 4, checked: 0 });
  });
});

describe("checkedItems", () => {
  it("seleziona gli item spuntati e non cancellati", () => {
    const items = [
      makeItem({ id: "a", checkedAt: "2026-08-11T10:30:00.000Z" }),
      makeItem({ id: "b" }),
      makeItem({
        id: "c",
        checkedAt: "2026-08-11T10:30:00.000Z",
        deletedAt: "2026-08-11T10:40:00.000Z",
      }),
    ];
    expect(checkedItems(items).map((item) => item.id)).toEqual(["a"]);
  });
});
