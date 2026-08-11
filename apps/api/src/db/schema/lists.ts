import { sql } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { categories } from "./support.js";

export const lists = pgTable(
  "lists",
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
  (table) => [index("idx_lists_owner").on(table.ownerId)],
);

export const listMembers = pgTable(
  "list_members",
  {
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissions: integer("permissions").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index("idx_list_members_user").on(table.userId),
  ],
);

export const listItems = pgTable(
  "list_items",
  {
    /** UUID v7 generato dal client: rende l'INSERT idempotente. */
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    categoryId: text("category_id").references(() => categories.id),
    note: text("note"),
    /** `NULL` = ancora da comprare. */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    checkedBy: text("checked_by").references(() => users.id),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Perno del locking ottimistico. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Tombstone: mai una DELETE fisica. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_list_items_list")
      .on(table.listId)
      .where(sql`${table.deletedAt} IS NULL`),
    // Riservato al futuro `sync.since(listId, timestamp)`.
    index("idx_list_items_sync").on(table.listId, table.updatedAt),
  ],
);
