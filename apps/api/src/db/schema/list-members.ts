import {
  check,
  foreignKey,
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
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const listMembers = pgTable(
  "list_members",
  {
    listId: text("list_id").notNull(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
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
    index("idx_list_members_tenant").on(table.tenantId),
    foreignKey({
      name: "list_members_list_tenant_lists_fkey",
      columns: [table.listId, table.tenantId],
      foreignColumns: [lists.id, lists.tenantId],
    }).onDelete("cascade"),
    foreignKey({
      name: "list_members_user_tenant_users_fkey",
      columns: [table.userId, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }).onDelete("cascade"),
    check(
      "list_members_permissions_check",
      sql`(${table.permissions} & ${Permission.Read}) = ${Permission.Read} AND (${table.permissions} | ${ALL_PERMISSIONS}) = ${ALL_PERMISSIONS}`,
    ),
  ],
);
