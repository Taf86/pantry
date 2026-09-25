import { MAX_NAME_LENGTH, MAX_QUANTITY } from "./constants.js";
import { fold } from "./text.js";
import {
  FILLER_WORDS,
  LOOSE_UNITS,
  UNITS,
  UnitCodes,
  type ParseLocale,
  type UnitCode,
} from "./units.js";

/**
 * Turns what the user typed into a structured item.
 *
 * Pure and synchronous, with the locale as a plain argument rather than an
 * i18next dependency, so it stays testable in node and usable on the server.
 *
 * It lives in `shared` because the client parses — the item is rendered
 * optimistically while offline, so the stored form must be identical to what
 * was shown, and a server-side re-parse would make the name flicker on sync.
 * `rawText` is what keeps re-parsing history possible later.
 *
 * THE DISAMBIGUATION RULE: when in doubt, everything is the name. A word that
 * is in neither the unit aliases nor the packaging dictionary is never eaten,
 * because eating a word that belongs to the product is the one failure the
 * user cannot work around.
 */
export interface ParsedItem {
  /** Exactly what was typed, whitespace-collapsed. Never empty for real input. */
  rawText: string;
  /** Never empty when the input was not blank. Original casing and accents. */
  name: string;
  /** `null` when nothing unambiguously numeric led the string. */
  quantity: number | null;
  /** Canonical registry code. `null` when the unit word is unknown or absent. */
  unit: UnitCode | null;
  /** The word verbatim, when it is a known packaging word with no dimension. */
  unitText: string | null;
}

interface Token {
  /** The original slice: casing and accents preserved, for the name. */
  raw: string;
  /** Case- and accent-insensitive form, for every dictionary lookup. */
  folded: string;
}

const aliasCache = new Map<ParseLocale, ReadonlyMap<string, UnitCode>>();
const looseCache = new Map<ParseLocale, ReadonlySet<string>>();
const fillerCache = new Map<ParseLocale, ReadonlySet<string>>();

/** Folded alias -> canonical code, built once per locale. */
export const unitAliasIndex = (
  locale: ParseLocale,
): ReadonlyMap<string, UnitCode> => {
  const cached = aliasCache.get(locale);
  if (cached) return cached;

  const index = new Map<string, UnitCode>();
  for (const code of UnitCodes) {
    for (const alias of UNITS[code].aliases[locale])
      index.set(fold(alias), code);
  }
  aliasCache.set(locale, index);
  return index;
};

const looseUnitIndex = (locale: ParseLocale): ReadonlySet<string> => {
  const cached = looseCache.get(locale);
  if (cached) return cached;

  const index = new Set(LOOSE_UNITS[locale].map(fold));
  looseCache.set(locale, index);
  return index;
};

const fillerIndex = (locale: ParseLocale): ReadonlySet<string> => {
  const cached = fillerCache.get(locale);
  if (cached) return cached;

  const index = new Set(FILLER_WORDS[locale].map((word) => fold(word)));
  fillerCache.set(locale, index);
  return index;
};

const EMPTY: ParsedItem = {
  rawText: "",
  name: "",
  quantity: null,
  unit: null,
  unitText: null,
};

/** `2kg` -> `["2", "kg"]`, `3x` -> `["3", "x"]`. Leading token only. */
const UNGLUE = /^(\d+(?:[.,]\d+)?)\s*(\p{L}+|[x×])$/u;

const QUANTITY = /^(\d{1,7})(?:([.,])(\d{1,3}))?$/;

const MULTIPLIERS = new Set(["x", "×"]);

/**
 * Reads a leading number, or returns `null` and leaves it in the name.
 *
 * The separator rule is locale-driven and deterministic rather than clever:
 * in Italian a comma is always decimal, while a dot is decimal with one or two
 * digits after it and a thousands separator with exactly three — so "1.500 g"
 * is 1500 g and "1.5 l" is a litre and a half. English mirrors it.
 */
const readQuantity = (token: string, locale: ParseLocale): number | null => {
  const match = QUANTITY.exec(token);
  if (!match) return null;

  const [, intPart, separator, fraction] = match;

  // A leading zero is never a quantity unless the integer part is just "0":
  // "00 farina" is flour, not zero flour.
  if (intPart!.length > 1 && intPart!.startsWith("0")) return null;

  if (separator === undefined || fraction === undefined) {
    const value = Number(intPart);
    return value <= MAX_QUANTITY ? value : null;
  }

  const decimalSeparator = locale === "it" ? "," : ".";
  const isThousands = separator !== decimalSeparator && fraction.length === 3;
  const value = isThousands
    ? Number(`${intPart}${fraction}`)
    : Number(`${intPart}.${fraction}`);

  return Number.isFinite(value) && value <= MAX_QUANTITY ? value : null;
};

/**
 * Strips an elided filler glued to the next word: "d'olio" -> "olio".
 * Returns `null` when nothing was glued.
 */
const stripElision = (
  token: Token,
  fillers: ReadonlySet<string>,
): Token | null => {
  for (const filler of fillers) {
    if (!filler.endsWith("'")) continue;
    if (
      token.folded.length > filler.length &&
      token.folded.startsWith(filler)
    ) {
      const raw = token.raw.slice(filler.length);
      return { raw, folded: fold(raw) };
    }
  }
  return null;
};

export const parseItemText = (
  input: string,
  locale: ParseLocale = "it",
): ParsedItem => {
  const rawText = input.normalize("NFC").replace(/\s+/g, " ").trim();
  if (rawText.length === 0) return EMPTY;

  const untouched: ParsedItem = {
    rawText,
    name: rawText.slice(0, MAX_NAME_LENGTH),
    quantity: null,
    unit: null,
    unitText: null,
  };

  const tokens: Token[] = rawText
    .split(" ")
    .map((raw) => ({ raw, folded: fold(raw) }));

  // Ungluing applies to the leading token alone: "farina00" stays a name.
  const glued = UNGLUE.exec(tokens[0]!.raw);
  if (glued) {
    tokens.splice(
      0,
      1,
      ...[glued[1]!, glued[2]!].map((raw) => ({ raw, folded: fold(raw) })),
    );
  }

  const quantity = readQuantity(tokens[0]!.folded, locale);
  // No leading quantity means no unit, no filler, no consumption at all.
  if (quantity === null) return untouched;

  let cursor = 1;
  let unit: UnitCode | null = null;
  let unitText: string | null = null;

  // "3 x yogurt" is "3 yogurt": the multiplier is noise, and leaving `unit`
  // null lets the catalog's remembered unit fill the gap.
  if (cursor < tokens.length && MULTIPLIERS.has(tokens[cursor]!.folded)) {
    cursor += 1;
  }

  if (cursor < tokens.length) {
    const candidate = tokens[cursor]!;
    const code = unitAliasIndex(locale).get(candidate.folded);
    if (code !== undefined) {
      unit = code;
      cursor += 1;
    } else if (looseUnitIndex(locale).has(candidate.folded)) {
      unitText = candidate.raw;
      cursor += 1;
    }
  }

  const fillers = fillerIndex(locale);
  if (cursor < tokens.length - 1 && fillers.has(tokens[cursor]!.folded)) {
    cursor += 1;
  } else if (cursor < tokens.length) {
    const stripped = stripElision(tokens[cursor]!, fillers);
    if (stripped !== null) tokens[cursor] = stripped;
  }

  const name = tokens
    .slice(cursor)
    .map((token) => token.raw)
    .join(" ")
    .trim();

  // Consuming everything would leave an item with no name. "2 kg" is a note to
  // self, not a quantity of nothing: hand the whole string back as the name.
  if (name.length === 0) return untouched;

  return {
    rawText,
    name: name.slice(0, MAX_NAME_LENGTH),
    quantity,
    unit,
    unitText,
  };
};
