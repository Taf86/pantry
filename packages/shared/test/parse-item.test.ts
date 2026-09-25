import { describe, expect, it } from "vitest";

import { parseItemText, unitAliasIndex } from "../src/parse-item.js";
import { MAX_NAME_LENGTH } from "../src/constants.js";
import { LOOSE_UNITS, PARSE_LOCALES, type ParseLocale } from "../src/units.js";

interface Case {
  input: string;
  locale?: ParseLocale;
  quantity: number | null;
  unit: string | null;
  unitText: string | null;
  name: string;
  why: string;
}

const cases: Case[] = [
  {
    input: "2 kg patate",
    quantity: 2,
    unit: "kg",
    unitText: null,
    name: "patate",
    why: "the baseline",
  },
  {
    input: "1,5 l latte",
    quantity: 1.5,
    unit: "l",
    unitText: null,
    name: "latte",
    why: "an Italian decimal comma",
  },
  {
    input: "3 x yogurt",
    quantity: 3,
    unit: null,
    unitText: null,
    name: "yogurt",
    why: "the multiplier is noise and the unit is left for the catalogue",
  },
  {
    input: "2 litri di latte",
    quantity: 2,
    unit: "l",
    unitText: null,
    name: "latte",
    why: "a spelled-out alias followed by a filler",
  },
  {
    input: "pane",
    quantity: null,
    unit: null,
    unitText: null,
    name: "pane",
    why: "a bare name",
  },
  {
    input: "2 mazzi basilico",
    quantity: 2,
    unit: null,
    unitText: "mazzi",
    name: "basilico",
    why: "a packaging word has no dimension",
  },
  {
    input: "2kg patate",
    quantity: 2,
    unit: "kg",
    unitText: null,
    name: "patate",
    why: "a quantity glued to its unit",
  },
  {
    input: "2 patate dolci",
    quantity: 2,
    unit: null,
    unitText: null,
    name: "patate dolci",
    why: "a word in neither dictionary is never eaten",
  },
  {
    input: "farina 00",
    quantity: null,
    unit: null,
    unitText: null,
    name: "farina 00",
    why: "a trailing number is not a quantity",
  },
  {
    input: "00 farina",
    quantity: null,
    unit: null,
    unitText: null,
    name: "00 farina",
    why: "a leading zero is not a quantity",
  },
  {
    input: "1.500 g farina",
    quantity: 1500,
    unit: "g",
    unitText: null,
    name: "farina",
    why: "three digits after a dot are thousands",
  },
  {
    input: "1.5 l latte",
    quantity: 1.5,
    unit: "l",
    unitText: null,
    name: "latte",
    why: "one digit after a dot is a decimal",
  },
  {
    input: "2 kg",
    quantity: null,
    unit: null,
    unitText: null,
    name: "2 kg",
    why: "a parse that would leave no name is discarded whole",
  },
  {
    input: "di tutto un po'",
    quantity: null,
    unit: null,
    unitText: null,
    name: "di tutto un po'",
    why: "a filler is only dropped after a quantity",
  },
  {
    input: "6 uova",
    quantity: 6,
    unit: null,
    unitText: null,
    name: "uova",
    why: "a countable with no unit word",
  },
  {
    input: "500 g di prosciutto crudo",
    quantity: 500,
    unit: "g",
    unitText: null,
    name: "prosciutto crudo",
    why: "a multi-word name survives",
  },
  {
    input: "3 confezioni di tonno",
    quantity: 3,
    unit: null,
    unitText: "confezioni",
    name: "tonno",
    why: "a packaging word followed by a filler",
  },
  {
    input: "acqua 2 l",
    quantity: null,
    unit: null,
    unitText: null,
    name: "acqua 2 l",
    why: "a quantity is only ever read in the leading position",
  },
  {
    input: "2 etti mortadella",
    quantity: 2,
    unit: "hg",
    unitText: null,
    name: "mortadella",
    why: "a colloquial alias resolves without rescaling the number",
  },
  {
    input: "12 x 1,5 l acqua",
    quantity: 12,
    unit: null,
    unitText: null,
    name: "1,5 l acqua",
    why: "only one leading quantity is read",
  },
  {
    input: "Latte Parmalat 1 l",
    quantity: null,
    unit: null,
    unitText: null,
    name: "Latte Parmalat 1 l",
    why: "casing is preserved and nothing is eaten",
  },
  {
    input: "2 kg d'olio",
    quantity: 2,
    unit: "kg",
    unitText: null,
    name: "olio",
    why: "an elided filler glued to the name is stripped",
  },
  {
    input: "  3   x   pane  ",
    quantity: 3,
    unit: null,
    unitText: null,
    name: "pane",
    why: "surrounding and repeated whitespace collapses",
  },
  {
    input: "2 kg potatoes",
    locale: "en",
    quantity: 2,
    unit: "kg",
    unitText: null,
    name: "potatoes",
    why: "the locale switches the dictionaries",
  },
];

describe("parseItemText", () => {
  for (const testCase of cases) {
    it(`reads "${testCase.input}" because ${testCase.why}`, () => {
      const parsed = parseItemText(testCase.input, testCase.locale ?? "it");

      expect({
        quantity: parsed.quantity,
        unit: parsed.unit,
        unitText: parsed.unitText,
        name: parsed.name,
      }).toEqual({
        quantity: testCase.quantity,
        unit: testCase.unit,
        unitText: testCase.unitText,
        name: testCase.name,
      });
    });
  }

  it("keeps what the user typed alongside what it understood", () => {
    expect(parseItemText("  2   kg   patate ").rawText).toBe("2 kg patate");
  });

  it("returns an empty parse for blank input", () => {
    expect(parseItemText("   ")).toEqual({
      rawText: "",
      name: "",
      quantity: null,
      unit: null,
      unitText: null,
    });
  });

  it("never returns an empty name for input that is not blank", () => {
    for (const testCase of cases) {
      expect(
        parseItemText(testCase.input, testCase.locale ?? "it").name,
      ).not.toBe("");
    }
  });

  it("never drops a word that is in neither dictionary", () => {
    const parsed = parseItemText("4 barattoli passata di pomodoro biologica");

    expect(parsed.name).toBe("passata di pomodoro biologica");
    expect(parsed.unitText).toBe("barattoli");
  });

  it("clamps an absurdly long name instead of rejecting it", () => {
    const parsed = parseItemText(`2 kg ${"a".repeat(MAX_NAME_LENGTH * 2)}`);

    expect(parsed.name).toHaveLength(MAX_NAME_LENGTH);
  });

  it("refuses a quantity above the cap rather than storing it", () => {
    expect(parseItemText("99999999 patate").quantity).toBeNull();
  });
});

describe("the unit dictionaries", () => {
  it.each(PARSE_LOCALES)(
    "maps no alias to two different units in %s",
    (locale) => {
      const seen = new Map<string, string>();

      for (const [alias, code] of unitAliasIndex(locale)) {
        expect(seen.has(alias)).toBe(false);
        seen.set(alias, code);
      }
    },
  );

  it.each(PARSE_LOCALES)(
    "keeps packaging words out of the unit aliases in %s",
    (locale) => {
      const aliases = unitAliasIndex(locale);

      for (const word of LOOSE_UNITS[locale]) {
        expect(aliases.has(word)).toBe(false);
      }
    },
  );
});
