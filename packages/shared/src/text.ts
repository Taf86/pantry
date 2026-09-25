/**
 * Text folding, shared by the parser, the catalog key and the client-side
 * suggestion ranking.
 *
 * All three must agree on what counts as "the same word", or a product typed
 * with an accent would rank differently from the row it is supposed to match.
 */

/**
 * Case- and accent-insensitive form of a string.
 *
 * NFD splits an accented character into its base plus a combining mark, which
 * `\p{M}` then strips: "però" and "pero" fold to the same key without a
 * hand-written table of substitutions.
 */
export const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * The catalog key for a product name.
 *
 * Beyond folding it drops punctuation, so "Latte (intero)" and "latte intero"
 * resolve to one catalog row. Returns `""` for input that normalizes to
 * nothing — the signal to skip product resolution and leave `product_id` null
 * rather than create a nameless catalog entry.
 */
export const normalizeProductName = (raw: string): string =>
  fold(raw)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Collapses runs of whitespace without touching case or accents. */
export const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();
