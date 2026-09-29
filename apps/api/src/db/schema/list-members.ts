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
    // Known bits only, and Read among them: every other permission acts on a
    // list the member has to see, and no permission at all means no row.
    check(
      "list_members_permissions_check",
      sql`(${table.permissions} & ${Permission.Read}) = ${Permission.Read} AND (${table.permissions} | ${ALL_PERMISSIONS}) = ${ALL_PERMISSIONS}`,
    ),
  ],
);
