import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const tenants = pgTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    main: boolean("main").notNull().default(false),
  },
  (table) => [
    uniqueIndex("idx_tenants_main")
      .on(table.main)
      .where(sql`${table.main}`),
  ],
);
