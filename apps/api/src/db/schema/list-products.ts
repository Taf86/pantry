import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { UnitCodes } from "@pantry/shared";
import { categories } from "./categories.js";
import { lists } from "./lists.js";
import { products } from "./products.js";

/**
 * Per-list usage statistics: this, not `products`, is what the client reads.
 *
 * One row per distinct product per list keeps the suggestion payload small
 * enough to ship whole and persist in IndexedDB, which is what makes
 * suggestions work between the shelves with no signal.
 */
export const listProducts = pgTable(
  "list_products",
  {
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastQuantity: numeric("last_quantity", { mode: "number" }),
    lastUnit: text("last_unit", { enum: UnitCodes }),
    lastUnitText: text("last_unit_text"),
    /** Aisle override for this list: one household's shop is not another's. */
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.productId] }),
    index("idx_list_products_suggest").on(table.listId, table.useCount),
    index("idx_list_products_recent").on(table.listId, table.lastUsedAt),
  ],
);
