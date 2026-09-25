/**
 * Units of measure live in code, not in a table.
 *
 * They are a closed, slow-changing set whose plurals and abbreviations are
 * already i18next's job; a table would mean a second translation system
 * alongside the locale files, plus a backoffice CRUD nobody asked for.
 *
 * `dimension` and `base` are the forty lines that pay for themselves later:
 * without them the pantry threshold has no way to know that 1 kg covers a
 * 500 g minimum.
 */

export const UnitDimension = {
  mass: "mass",
  volume: "volume",
  count: "count",
} as const;
export type UnitDimension = (typeof UnitDimension)[keyof typeof UnitDimension];

/** Locales the parser knows how to read. Mirrors the app's `supportedLngs`. */
export const PARSE_LOCALES = ["it", "en"] as const;
export type ParseLocale = (typeof PARSE_LOCALES)[number];

export interface UnitDefinition {
  readonly dimension: UnitDimension;
  /** Multiplier to the dimension's base unit (g, ml, one piece). */
  readonly base: number;
  /** Parser input only. The canonical code is what gets stored. */
  readonly aliases: Readonly<Record<ParseLocale, readonly string[]>>;
}

/**
 * Declared as an explicit tuple rather than derived from `Object.keys`, so
 * `text("unit", { enum: UnitCodes })` narrows on the Drizzle side.
 */
export const UnitCodes = [
  "g",
  "hg",
  "kg",
  "ml",
  "cl",
  "dl",
  "l",
  "pz",
] as const;
export type UnitCode = (typeof UnitCodes)[number];

export const UNITS: Readonly<Record<UnitCode, UnitDefinition>> = {
  g: {
    dimension: UnitDimension.mass,
    base: 1,
    aliases: {
      it: ["g", "gr", "grammo", "grammi"],
      en: ["g", "gr", "gram", "grams"],
    },
  },
  hg: {
    dimension: UnitDimension.mass,
    base: 100,
    aliases: {
      it: ["hg", "etto", "etti", "ettogrammo", "ettogrammi"],
      en: ["hg", "hectogram", "hectograms"],
    },
  },
  kg: {
    dimension: UnitDimension.mass,
    base: 1000,
    aliases: {
      it: [
        "kg",
        "chilo",
        "chili",
        "chilogrammo",
        "chilogrammi",
        "kilo",
        "kili",
      ],
      en: ["kg", "kilo", "kilos", "kilogram", "kilograms"],
    },
  },
  ml: {
    dimension: UnitDimension.volume,
    base: 1,
    aliases: {
      it: ["ml", "millilitro", "millilitri"],
      en: ["ml", "millilitre", "millilitres", "milliliter", "milliliters"],
    },
  },
  cl: {
    dimension: UnitDimension.volume,
    base: 10,
    aliases: {
      it: ["cl", "centilitro", "centilitri"],
      en: ["cl", "centilitre", "centilitres"],
    },
  },
  dl: {
    dimension: UnitDimension.volume,
    base: 100,
    aliases: {
      it: ["dl", "decilitro", "decilitri"],
      en: ["dl", "decilitre", "decilitres"],
    },
  },
  l: {
    dimension: UnitDimension.volume,
    base: 1000,
    aliases: {
      it: ["l", "lt", "litro", "litri"],
      en: ["l", "lt", "litre", "litres", "liter", "liters"],
    },
  },
  pz: {
    dimension: UnitDimension.count,
    base: 1,
    aliases: {
      it: ["pz", "pezzo", "pezzi"],
      en: ["pc", "pcs", "piece", "pieces"],
    },
  },
};

/**
 * Packaging words: recognised as a unit, but carrying no dimension, so they
 * land in `unitText` verbatim instead of becoming a canonical code.
 *
 * This second dictionary is the whole of the disambiguation rule. "2 mazzi
 * basilico" and "2 patate dolci" have the same shape, and no heuristic can
 * separate them — so there is no heuristic, only two closed dictionaries.
 * A word in neither of them is part of the name.
 */
export const LOOSE_UNITS: Readonly<Record<ParseLocale, readonly string[]>> = {
  it: [
    "mazzo",
    "mazzi",
    "confezione",
    "confezioni",
    "conf",
    "pacco",
    "pacchi",
    "pacchetto",
    "pacchetti",
    "vasetto",
    "vasetti",
    "barattolo",
    "barattoli",
    "bottiglia",
    "bottiglie",
    "lattina",
    "lattine",
    "busta",
    "buste",
    "sacchetto",
    "sacchetti",
    "fetta",
    "fette",
    "spicchio",
    "spicchi",
    "cespo",
    "cespi",
    "rotolo",
    "rotoli",
    "vaschetta",
    "vaschette",
    "cassetta",
    "cassette",
    "retina",
    "retine",
    "grappolo",
    "grappoli",
    "filone",
    "filoni",
    "teglia",
    "teglie",
  ],
  en: [
    "bunch",
    "bunches",
    "pack",
    "packs",
    "packet",
    "packets",
    "jar",
    "jars",
    "bottle",
    "bottles",
    "can",
    "cans",
    "bag",
    "bags",
    "slice",
    "slices",
    "clove",
    "cloves",
    "head",
    "heads",
    "roll",
    "rolls",
    "tray",
    "trays",
  ],
};

/**
 * Filler words dropped between a quantity and the product name.
 *
 * Only ever removed *after* a quantity was read, so "di tutto un po'" keeps
 * its first word.
 */
export const FILLER_WORDS: Readonly<Record<ParseLocale, readonly string[]>> = {
  it: ["di", "d'", "del", "dello", "della", "dell'", "dei", "degli", "delle"],
  en: ["of"],
};

export const isUnitCode = (value: string): value is UnitCode =>
  (UnitCodes as readonly string[]).includes(value);

export const unitDimension = (code: UnitCode): UnitDimension =>
  UNITS[code].dimension;

/** Converts a quantity to its dimension's base unit (g, ml, one piece). */
export const toBaseUnit = (quantity: number, code: UnitCode): number =>
  quantity * UNITS[code].base;

/**
 * Converts between two units, or returns `null` when they measure different
 * things. Comparing grams to litres is a question with no answer, and a
 * silent zero would be worse than none.
 */
export const convertUnit = (
  quantity: number,
  from: UnitCode,
  to: UnitCode,
): number | null =>
  UNITS[from].dimension === UNITS[to].dimension
    ? toBaseUnit(quantity, from) / UNITS[to].base
    : null;
