import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("lists_id_tenant_unique").on(table.id, table.tenantId),
    index("idx_lists_tenant").on(table.tenantId),
    index("idx_lists_created_by").on(table.createdBy),
    foreignKey({
      name: "lists_created_by_tenant_users_fkey",
      columns: [table.createdBy, table.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }).onDelete("cascade"),
  ],
);
