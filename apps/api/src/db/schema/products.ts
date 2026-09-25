import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { UnitCodes } from "@pantry/shared";
import { categories } from "./categories.js";

/**
 * The global, internal product catalogue. It never leaves the API.
 *
 * The client sees only `list_products` joined to this, for lists it may read,
 * and never sends a product id: if it created the catalogue row, two people
 * typing "patate" offline would make two products, and deduplicating by name
 * would hand back an id different from the optimistic one — reintroducing
 * exactly the id reconciliation that client-generated ids exist to avoid.
 *
 * Resolution is therefore server-side and `list_items.product_id` is nullable:
 * an item is always displayable without it.
 */
export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    /** Folded, punctuation-free form: the deduplication key. */
    normalizedName: text("normalized_name").notNull().unique(),
    displayName: text("display_name").notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    defaultUnit: text("default_unit", { enum: UnitCodes }),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_products_category").on(table.categoryId)],
);
