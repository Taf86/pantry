import z from "zod";

import { categoryIdSchema } from "./common.js";

/**
 * The shared taxonomy that orders a list by supermarket aisle.
 *
 * TRANSLATION RULE, applied everywhere: what the system ships is translated
 * through i18n keys, what a user types is never translated. A system category
 * therefore carries a `slug` and no name, and the UI renders
 * `category.<slug>`; a user-created one carries a name and no slug, rendered
 * verbatim. That keeps one translation system — the locale files — instead of
 * a `category_translations` table maintained with different tooling.
 */
export const categorySchema = z.object({
  id: categoryIdSchema,
  /** Non-null means a system category: translate with `category.<slug>`. */
  slug: z.string().nullable(),
  /** Read only when `slug` is null. Never translated. */
  name: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type Category = z.infer<typeof categorySchema>;

/**
 * Ordered by aisle, not alphabetically: the numbers are the walking order
 * through a supermarket, which is what makes the list usable while shopping.
 *
 * Gaps of 100 leave room to slot a category in without renumbering.
 * System rows use their slug as id, so the seed is idempotent without a lookup.
 */
export const SYSTEM_CATEGORIES = [
  { slug: "produce", sortOrder: 100 },
  { slug: "bakery", sortOrder: 200 },
  { slug: "dairy", sortOrder: 300 },
  { slug: "meat_fish", sortOrder: 400 },
  { slug: "staples", sortOrder: 500 },
  { slug: "frozen", sortOrder: 600 },
  { slug: "drinks", sortOrder: 700 },
  { slug: "household", sortOrder: 800 },
  { slug: "personal_care", sortOrder: 900 },
  { slug: "other", sortOrder: 1000 },
] as const;

export type CategorySlug = (typeof SYSTEM_CATEGORIES)[number]["slug"];

export const CATEGORY_SLUGS = SYSTEM_CATEGORIES.map(
  (category) => category.slug,
) as readonly CategorySlug[];
