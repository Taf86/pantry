import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Deduplication of offline mutations.
 *
 * The client queue retries until the server answers, and the answer can
 * perfectly well be lost AFTER the operation was applied. The mutation id is
 * therefore claimed inside the same transaction as the operation: either both
 * hold, or neither does.
 */
export const appliedMutations = pgTable(
  "applied_mutations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_applied_mutations_cleanup").on(table.appliedAt)],
);
