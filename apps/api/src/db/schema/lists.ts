import { index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * A list needs no timestamps of its own.
 *
 * Its id is a client-generated UUID v7, so the first 48 bits already carry the
 * millisecond it was made: ordering by id IS ordering by creation, and
 * `uuidv7Timestamp` reads the instant back out when the UI wants to show it.
 * The only thing this asks in return is that every list is born with a v7 id,
 * which is true as long as the client is the one minting them.
 */
export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /**
     * Who made the list.
     *
     * It carries no authority: everything about who may do what lives in
     * `list_members`. What it does carry is lifetime, because the cascade
     * means a list does not outlive the account that created it. That is also
     * what stops a list being left with members but nobody able to manage it.
     */
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "cascade",
    }),
  },
  // Earns its keep now that the foreign key cascades: deleting a user has to
  // find the lists they created, and Postgres does not index the referencing
  // side of a foreign key on its own.
  (table) => [index("idx_lists_created_by").on(table.createdBy)],
);
