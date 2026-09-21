import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { RequestStatus, RequestStatuses, RequestTypes } from "@pantry/shared";
import { users } from "./users.js";

export const requests = pgTable(
  "requests",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: RequestTypes }).notNull(),
    status: text("status", { enum: RequestStatuses })
      .notNull()
      .default(RequestStatus.pending),
    email: text("email").notNull(),
    displayName: text("display_name"),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "requests_type_check",
      sql`${table.type} IN (${sql.join(
        RequestTypes.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    ),
    check(
      "requests_status_check",
      sql`${table.status} IN (${sql.join(
        RequestStatuses.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    ),
    uniqueIndex("idx_requests_open")
      .on(table.email)
      .where(sql`${table.status} = ${RequestStatus.pending}`),
    index("idx_requests_status").on(table.status),
  ],
);
