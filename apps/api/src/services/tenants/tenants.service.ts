import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Executor } from "../../db/client.js";
import { tenants } from "../../db/schema/tenants.js";

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
