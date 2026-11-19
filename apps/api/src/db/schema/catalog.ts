import { UnitKinds } from "@pantry/shared";
import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Seeded lookups. The rows are written by the migration from the constants in
 * `@pantry/shared`, which stay the source of truth; they live here so that
 * columns can reference them and SQL can sort by them.
 */
export const categories = pgTable("categories", {
  code: text("code").primaryKey(),
  sortOrder: integer("sort_order").notNull(),
});

export const units = pgTable(
  "units",
  {
    code: text("code").primaryKey(),
    kind: text("kind", { enum: UnitKinds }).notNull(),
    allowsDecimal: boolean("allows_decimal").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    check(
      "units_kind_check",
      sql`${table.kind} IN (${sql.join(
        UnitKinds.map((k) => sql`${k}`),
        sql`, `,
      )})`,
    ),
  ],
);
