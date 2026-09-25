import { describe, expect, it } from "vitest";

import {
  PARSE_LOCALES,
  UNITS,
  UnitCodes,
  convertUnit,
  isUnitCode,
  toBaseUnit,
} from "../src/units.js";

describe("the unit registry", () => {
  it("converts every unit to its dimension's base", () => {
    expect(toBaseUnit(2, "kg")).toBe(2000);
    expect(toBaseUnit(1.5, "l")).toBe(1500);
    expect(toBaseUnit(3, "hg")).toBe(300);
  });

  it("converts within a dimension", () => {
    expect(convertUnit(1500, "g", "kg")).toBe(1.5);
    expect(convertUnit(50, "cl", "l")).toBe(0.5);
  });

  it("refuses to convert across dimensions instead of inventing a number", () => {
    expect(convertUnit(1, "kg", "l")).toBeNull();
  });

  it("declares aliases for every supported locale", () => {
    for (const code of UnitCodes) {
      for (const locale of PARSE_LOCALES) {
        expect(UNITS[code].aliases[locale].length).toBeGreaterThan(0);
      }
    }
  });

  it("recognises its own codes and nothing else", () => {
    expect(isUnitCode("kg")).toBe(true);
    expect(isUnitCode("mazzi")).toBe(false);
  });
});
