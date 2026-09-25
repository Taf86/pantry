import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { SessionEndReasons } from "@pantry/shared";
import { lists } from "./lists.js";
import { users } from "./users.js";

/**
 * An advisory lease over who is at the supermarket for this list.
 *
 * Exclusivity is real and it is Postgres's job, not the application's: the
 * partial unique index below is the whole of the mutual exclusion, so two
 * devices claiming at once means one of them takes a unique violation.
 *
 * What the lease deliberately does NOT do is authorize anything.
 * Permission.Shop alone allows checking items off. Whoever is in the shop is
 * offline, so their heartbeat does not arrive and the lease will expire on
 * them: if it gated checks, their entire queue would be rejected on the way
 * home. The lease coordinates, it never guards.
 *
 * The id is server-generated, a deliberate exception to client-generated ids:
 * claiming is online-only by nature, and the index, not the client, arbitrates.
 */
export const shoppingSessions = pgTable(
  "shopping_sessions",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason", { enum: SessionEndReasons }),
  },
  (table) => [
    check(
      "shopping_sessions_end_reason_check",
      sql`${table.endReason} IS NULL OR ${table.endReason} IN (${sql.join(
        SessionEndReasons.map((reason) => sql`${reason}`),
        sql`, `,
      )})`,
    ),
    check(
      "shopping_sessions_ended_check",
      sql`(${table.endedAt} IS NULL) = (${table.endReason} IS NULL)`,
    ),
    /** One active session per list. This line is the feature. */
    uniqueIndex("idx_shopping_sessions_active")
      .on(table.listId)
      .where(sql`${table.endedAt} IS NULL`),
    index("idx_shopping_sessions_expiry")
      .on(table.expiresAt)
      .where(sql`${table.endedAt} IS NULL`),
    /** Supports the temporal lookup that stamps list_items.checked_in. */
    index("idx_shopping_sessions_list").on(table.listId, table.startedAt),
  ],
);
