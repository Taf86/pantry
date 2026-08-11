import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth.js";

/**
 * Tassonomia condivisa: serve a ordinare la lista per corsia del supermercato.
 * È trasversale a liste e dispense, quindi vive da sola.
 */
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Deduplicazione delle mutazioni offline.
 *
 * La coda ritenta, e un ritentativo non deve mai applicare due volte la stessa
 * operazione. L'inserimento qui avviene nella stessa transazione
 * dell'operazione vera: o valgono entrambe, o nessuna delle due.
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
