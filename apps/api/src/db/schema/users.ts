import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { UserRole, UserRoles, UserStatus, UserStatuses } from "@pantry/shared";
import { tenants } from "./tenants.js";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role", { enum: UserRoles }).notNull().default(UserRole.user),
    status: text("status", { enum: UserStatuses })
      .notNull()
      .default(UserStatus.unactivated),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => [
    unique("users_id_tenant_unique").on(table.id, table.tenantId),
    index("idx_users_tenant").on(table.tenantId),
    check(
      "users_role_check",
      sql`${table.role} IN (${sql.join(
        UserRoles.map((r) => sql`${r}`),
        sql`, `,
      )})`,
    ),
    check(
      "users_status_check",
      sql`${table.status} IN (${sql.join(
        UserStatuses.map((r) => sql`${r}`),
        sql`, `,
      )})`,
    ),
  ],
);
