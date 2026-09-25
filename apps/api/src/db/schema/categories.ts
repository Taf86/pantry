import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * The shared taxonomy, used to order a list by supermarket aisle.
 *
 * A system category carries a `slug` and no name: the client renders
 * `category.<slug>` through i18next, so the taxonomy is translated by the same
 * locale files as everything else instead of a `category_translations` table
 * maintained with different tooling. A user-created category (not in v1, but
 * the columns are here so it lands without a migration) carries a name and no
 * slug, and is never translated — you cannot translate what someone typed.
 *
 * System rows use their slug as id, which makes the seed idempotent without a
 * lookup.
 */
export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    slug: text("slug").unique(),
    name: text("name"),
    /** Walking order through the shop, not alphabetical order. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "categories_label_check",
      sql`(${table.slug} IS NOT NULL AND ${table.name} IS NULL)
       OR (${table.slug} IS NULL AND ${table.name} IS NOT NULL)`,
    ),
    index("idx_categories_order").on(table.sortOrder, table.id),
  ],
);
