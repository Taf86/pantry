import * as z from "zod";

/**
 * Seeded lookups for list items: the categories a product is filed under and
 * the units a quantity is measured in.
 *
 * These constants are the source of truth. The database mirrors them in lookup
 * tables, filled by a migration, so that columns can reference them; a test
 * keeps the two in step. Labels are translated on the client only, under
 * `category.<code>` and `unit.<code>`.
 */

/** Categories in the order of a typical walk through the supermarket. */
export const CategoryCodes = [
  "produce",
  "bakery",
  "deli",
  "meat",
  "fish",
  "dairy",
  "pasta_rice",
  "baking",
  "pantry",
  "breakfast",
  "snacks",
  "beverages",
  "frozen",
  "household",
  "personal_care",
  "baby",
  "pets",
  "other",
] as const;
export type CategoryCode = (typeof CategoryCodes)[number];
export const categoryCodeSchema = z.enum(CategoryCodes);

/** Where items without a resolved product, or without a category, end up. */
export const FALLBACK_CATEGORY: CategoryCode = "other";

export type Category = {
  code: CategoryCode;
  sortOrder: number;
};

export const Categories: readonly Category[] = CategoryCodes.map(
  (code, index) => ({ code, sortOrder: (index + 1) * 10 }),
);

export const UnitKinds = ["count", "mass", "volume"] as const;
export type UnitKind = (typeof UnitKinds)[number];

export const UnitCodes = ["pc", "g", "hg", "kg", "ml", "cl", "l"] as const;
export type UnitCode = (typeof UnitCodes)[number];
export const unitCodeSchema = z.enum(UnitCodes);

export type Unit = {
  code: UnitCode;
  kind: UnitKind;
  allowsDecimal: boolean;
  sortOrder: number;
};

/**
 * Container words (bottle, pack, can…) are deliberately not units: containers
 * are counted in `pc`, and the word stays in the product name only when it is
 * needed to tell the product apart.
 */
export const Units: readonly Unit[] = [
  { code: "pc", kind: "count", allowsDecimal: false, sortOrder: 10 },
  { code: "g", kind: "mass", allowsDecimal: false, sortOrder: 20 },
  { code: "hg", kind: "mass", allowsDecimal: true, sortOrder: 30 },
  { code: "kg", kind: "mass", allowsDecimal: true, sortOrder: 40 },
  { code: "ml", kind: "volume", allowsDecimal: false, sortOrder: 50 },
  { code: "cl", kind: "volume", allowsDecimal: true, sortOrder: 60 },
  { code: "l", kind: "volume", allowsDecimal: true, sortOrder: 70 },
];

export const findUnit = (code: UnitCode): Unit =>
  Units.find((unit) => unit.code === code) as Unit;

/**
 * The words the item parser reads as a unit, already normalised (lower case,
 * no accents). Each unit's code is an alias of itself.
 */
export const UNIT_ALIASES: Readonly<Record<string, UnitCode>> = {
  pc: "pc",
  pz: "pc",
  pzz: "pc",
  pezzo: "pc",
  pezzi: "pc",
  g: "g",
  gr: "g",
  grammo: "g",
  grammi: "g",
  hg: "hg",
  etto: "hg",
  etti: "hg",
  kg: "kg",
  chilo: "kg",
  chili: "kg",
  kilo: "kg",
  kili: "kg",
  chilogrammo: "kg",
  chilogrammi: "kg",
  ml: "ml",
  millilitro: "ml",
  millilitri: "ml",
  cl: "cl",
  centilitro: "cl",
  centilitri: "cl",
  l: "l",
  lt: "l",
  litro: "l",
  litri: "l",
};
