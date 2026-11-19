import { describe, expect, it } from "vitest";

import {
  Categories,
  CategoryCodes,
  FALLBACK_CATEGORY,
  UNIT_ALIASES,
  UnitCodes,
  Units,
  categoryCodeSchema,
  findUnit,
  unitCodeSchema,
} from "../src/catalog.js";

describe("categories", () => {
  it("lists every code once, in a strictly increasing order", () => {
    expect(Categories.map((c) => c.code)).toEqual([...CategoryCodes]);
    const orders = Categories.map((c) => c.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("keeps the fallback category last", () => {
    expect(Categories.at(-1)?.code).toBe(FALLBACK_CATEGORY);
  });

  it("rejects unknown codes", () => {
    expect(categoryCodeSchema.safeParse("dairy").success).toBe(true);
    expect(categoryCodeSchema.safeParse("Dairy").success).toBe(false);
  });
});

describe("units", () => {
  it("describes every code once", () => {
    expect(Units.map((u) => u.code)).toEqual([...UnitCodes]);
    expect(unitCodeSchema.safeParse("bottle").success).toBe(false);
  });

  it("allows decimals only where they make sense", () => {
    expect(findUnit("pc").allowsDecimal).toBe(false);
    expect(findUnit("kg").allowsDecimal).toBe(true);
  });

  it("maps every alias to a known unit and every code to itself", () => {
    for (const code of UnitCodes) expect(UNIT_ALIASES[code]).toBe(code);
    for (const [alias, code] of Object.entries(UNIT_ALIASES)) {
      expect(alias).toBe(alias.toLowerCase());
      expect(UnitCodes).toContain(code);
    }
  });
});
