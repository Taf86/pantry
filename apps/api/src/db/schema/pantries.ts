import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { categories } from "./support.js";

export const pantries = pgTable(
  "pantries",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("idx_pantries_owner").on(table.ownerId)],
);

export const pantryMembers = pgTable(
  "pantry_members",
  {
    pantryId: text("pantry_id")
      .notNull()
      .references(() => pantries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissions: integer("permissions").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.pantryId, table.userId] }),
    index("idx_pantry_members_user").on(table.userId),
  ],
);

/**
 * Albero a profondità arbitraria: adjacency list.
 * Armadio cucina → Scaffale 1 → Cassetto 1 → Biscotti.
 *
 * Non una closure table: una dispensa ha decine di nodi, non milioni, e la
 * CTE ricorsiva è più che sufficiente.
 */
export const pantryNodes = pgTable(
  "pantry_nodes",
  {
    id: text("id").primaryKey(),
    pantryId: text("pantry_id")
      .notNull()
      .references(() => pantries.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => pantryNodes.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Solo per kind = 'item'.
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    categoryId: text("category_id").references(() => categories.id),
    expiresAt: date("expires_at", { mode: "string" }),
    /** Soglia sotto la quale l'item risulta "manca". */
    minQuantity: numeric("min_quantity", { mode: "number" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "pantry_nodes_kind_check",
      sql`${table.kind} IN ('container','item')`,
    ),
    index("idx_pantry_nodes_parent").on(table.parentId),
    index("idx_pantry_nodes_pantry")
      .on(table.pantryId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_pantry_nodes_expiry")
      .on(table.pantryId, table.expiresAt)
      .where(sql`${table.kind} = 'item' AND ${table.deletedAt} IS NULL`),
  ],
);
