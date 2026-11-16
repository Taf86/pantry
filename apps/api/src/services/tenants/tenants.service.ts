import { asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Tenant } from "@pantry/shared";
import type { Database, Executor } from "../../db/client.js";
import { tenants } from "../../db/schema/tenants.js";

export const getTenants = async (deps: { db: Database }): Promise<Tenant[]> =>
  deps.db
    .select({ id: tenants.id, name: tenants.name, main: tenants.main })
    .from(tenants)
    .orderBy(desc(tenants.main), asc(tenants.name));

export const requireTenant = async (
  tx: Executor,
  tenantId: string,
): Promise<void> => {
  const [row] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant not existing.",
    });
  }
};

export const requireMainTenantId = async (tx: Executor): Promise<string> => {
  const [row] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.main, true))
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Main tenant missing.",
    });
  }
  return row.id;
};
