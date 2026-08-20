import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { UserRole, UserRoles, UserStatus, UserStatuses } from "@pantry/shared";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
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
    check("users_role_check", sql`${table.role} IN (${UserRoles.join(",")})`),
    check(
      "users_status_check",
      sql`${table.status} IN (${UserStatuses.join(",")})`,
    ),
  ],
);
