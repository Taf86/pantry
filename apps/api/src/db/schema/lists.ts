import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /**
     * Provenance only, and deliberately without authority.
     *
     * Everything about who may do what lives in `list_members`. Two sources of
     * truth for "who can manage this list" is how you end up unable to answer
     * the question after the owner's membership row is gone.
     */
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Tombstone: a soft-deleted list grants nothing to anybody. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("idx_lists_created_by").on(table.createdBy)],
);
