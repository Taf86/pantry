import { describe, expect, it } from "vitest";

import {
  mergeParsedWithCatalog,
  rankSuggestions,
  type CatalogEntry,
} from "../src/catalog.js";
import { parseItemText } from "../src/parse-item.js";

const NOW = Date.parse("2026-09-24T10:00:00.000Z");
const daysAgo = (days: number): string =>
  new Date(NOW - days * 86_400_000).toISOString();

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  name: "latte",
  categoryId: "dairy",
  lastQuantity: 1,
  lastUnit: "l",
  lastUnitText: null,
  useCount: 1,
  lastUsedAt: daysAgo(1),
  ...overrides,
});

describe("rankSuggestions", () => {
  it("puts an exact match above a merely frequent one", () => {
    const ranked = rankSuggestions(
      [
        entry({ name: "latte di mandorla", useCount: 20 }),
        entry({ name: "latte", useCount: 1 }),
      ],
      "latte",
      { now: NOW },
    );

    expect(ranked[0]?.entry.name).toBe("latte");
  });

  it("matches a word inside the name, not only its start", () => {
    const ranked = rankSuggestions(
      [entry({ name: "petto di pollo" })],
      "pollo",
      {
        now: NOW,
      },
    );

    expect(ranked).toHaveLength(1);
  });

  it("ignores accents and case", () => {
    const ranked = rankSuggestions([entry({ name: "Però" })], "pero", {
      now: NOW,
    });

    expect(ranked).toHaveLength(1);
  });

  it("prefers what was bought recently between equal matches", () => {
    const ranked = rankSuggestions(
      [
        entry({ name: "pane a", lastUsedAt: daysAgo(200) }),
        entry({ name: "pane b", lastUsedAt: daysAgo(2) }),
      ],
      "pane",
      { now: NOW },
    );

    expect(ranked[0]?.entry.name).toBe("pane b");
  });

  it("drops what does not match at all", () => {
    expect(
      rankSuggestions([entry({ name: "latte" })], "zzz", { now: NOW }),
    ).toEqual([]);
  });

  it("flags what is already on the list instead of hiding it", () => {
    const ranked = rankSuggestions([entry({ name: "latte" })], "lat", {
      now: NOW,
      inList: new Set(["latte"]),
    });

    expect(ranked[0]?.alreadyInList).toBe(true);
  });

  it("honours the limit", () => {
    const entries = Array.from({ length: 30 }, (_, index) =>
      entry({ name: `pane ${String(index)}` }),
    );

    expect(
      rankSuggestions(entries, "pane", { now: NOW, limit: 5 }),
    ).toHaveLength(5);
  });

  it("ranks against the parsed name, which is what makes a typed quantity harmless", () => {
    const parsed = parseItemText("2 kg pat");
    const ranked = rankSuggestions([entry({ name: "patate" })], parsed.name, {
      now: NOW,
    });

    expect(ranked[0]?.entry.name).toBe("patate");
  });
});

describe("mergeParsedWithCatalog", () => {
  it("fills the unit from what the catalogue remembers", () => {
    const merged = mergeParsedWithCatalog(parseItemText("2 latte"), entry({}));

    expect(merged).toMatchObject({
      quantity: 2,
      unit: "l",
      categoryId: "dairy",
    });
  });

  it("lets what was typed beat what was remembered", () => {
    const merged = mergeParsedWithCatalog(
      parseItemText("2 kg latte"),
      entry({}),
    );

    expect(merged.unit).toBe("kg");
  });

  it("keeps a typed packaging word instead of the remembered unit", () => {
    const merged = mergeParsedWithCatalog(
      parseItemText("2 bottiglie latte"),
      entry({}),
    );

    expect(merged).toMatchObject({ unit: null, unitText: "bottiglie" });
  });

  it("leaves the category empty with no catalogue hit rather than guessing", () => {
    const merged = mergeParsedWithCatalog(parseItemText("cardamomo"), null);

    expect(merged).toMatchObject({ name: "cardamomo", categoryId: null });
  });
});
