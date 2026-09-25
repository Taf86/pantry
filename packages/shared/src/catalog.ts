import { MAX_SUGGESTIONS } from "./constants.js";
import { fold } from "./text.js";
import type { ParsedItem } from "./parse-item.js";
import type { UnitCode } from "./units.js";

/**
 * Suggestion ranking, kept pure so it can run against the cached catalogue
 * with no network — which is the whole point: the fast path for adding an item
 * is three letters and a tap, and it has to work between the shelves.
 *
 * A catalogue row carries no product id. Tapping a suggestion creates an
 * ordinary item with a client-generated id, and the server re-resolves the
 * product from the name; the client never learns the catalogue's identifiers.
 */
export interface CatalogEntry {
  name: string;
  categoryId: string | null;
  lastQuantity: number | null;
  lastUnit: UnitCode | null;
  lastUnitText: string | null;
  useCount: number;
  lastUsedAt: string;
}

export interface RankedSuggestion {
  entry: CatalogEntry;
  score: number;
  /** Kept and flagged rather than filtered: tapping it bumps the live row. */
  alreadyInList: boolean;
}

export interface RankOptions {
  limit?: number;
  now?: number;
  /** Folded names already on the list. */
  inList?: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

/** Tiered match, so an exact hit can never rank below a lucky substring. */
const matchScore = (folded: string, query: string): number => {
  if (query.length === 0) return 50;
  if (folded === query) return 1000;
  if (folded.startsWith(query)) return 400;
  if (folded.split(" ").some((word) => word.startsWith(query))) return 250;
  if (folded.includes(query)) return 100;
  return 0;
};

const recencyBonus = (lastUsedAt: string, now: number): number => {
  const age = now - Date.parse(lastUsedAt);
  if (Number.isNaN(age) || age < 0) return 0;
  if (age <= 7 * DAY_MS) return 40;
  if (age <= 30 * DAY_MS) return 20;
  if (age <= 90 * DAY_MS) return 8;
  return 0;
};

/**
 * Ranks catalogue entries against what has been typed.
 *
 * The caller passes `parseItemText(raw).name`, not the raw text: that is what
 * makes "2 kg pat" suggest *Patate* instead of matching nothing.
 */
export const rankSuggestions = (
  entries: readonly CatalogEntry[],
  query: string,
  options: RankOptions = {},
): RankedSuggestion[] => {
  const folded = fold(query);
  const now = options.now ?? Date.now();
  const limit = options.limit ?? MAX_SUGGESTIONS;
  const inList = options.inList ?? new Set<string>();

  return entries
    .map((entry) => {
      const key = fold(entry.name);
      const base = matchScore(key, folded);
      return base === 0
        ? null
        : {
            entry,
            score:
              base +
              Math.min(entry.useCount, 20) * 4 +
              recencyBonus(entry.lastUsedAt, now),
            alreadyInList: inList.has(key),
          };
    })
    .filter((ranked): ranked is RankedSuggestion => ranked !== null)
    .sort(
      (a, b) =>
        b.score - a.score || a.entry.name.localeCompare(b.entry.name, "it"),
    )
    .slice(0, limit);
};

export interface MergedItem {
  name: string;
  quantity: number | null;
  unit: UnitCode | null;
  unitText: string | null;
  categoryId: string | null;
}

/**
 * Combines what was typed with what the catalogue remembers.
 *
 * Typed beats remembered, remembered fills the gaps. The category is never
 * guessed client-side and never blocks on the network: with no catalogue hit
 * it stays null, the item renders uncategorised, and the server may classify
 * it on sync — at which point the row simply gains its category.
 */
export const mergeParsedWithCatalog = (
  parsed: ParsedItem,
  entry: CatalogEntry | null,
): MergedItem => {
  const typedUnit = parsed.unit !== null || parsed.unitText !== null;

  return {
    name: entry?.name ?? parsed.name,
    quantity: parsed.quantity,
    unit: typedUnit ? parsed.unit : (entry?.lastUnit ?? null),
    unitText: typedUnit ? parsed.unitText : (entry?.lastUnitText ?? null),
    categoryId: entry?.categoryId ?? null,
  };
};
