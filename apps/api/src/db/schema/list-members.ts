import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ALL_PERMISSIONS, Permission } from "@pantry/shared";
import { lists } from "./lists.js";
import { users } from "./users.js";

/** The sole authority on who may read, write, shop and share a list. */
export const listMembers = pgTable(
  "list_members",
  {
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissions: integer("permissions").notNull().default(Permission.Read),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index("idx_list_members_user").on(table.userId),
    check(
      "list_members_permissions_check",
      sql`(${table.permissions} | ${ALL_PERMISSIONS}) = ${ALL_PERMISSIONS}`,
    ),
  ],
);
