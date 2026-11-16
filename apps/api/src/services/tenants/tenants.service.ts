import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type {
  CreateTenantInput,
  Tenant,
  UpdateTenantInput,
} from "@pantry/shared";
import type { Database, Executor } from "../../db/client.js";
import { tenants } from "../../db/schema/tenants.js";
import { lists } from "../../db/schema/lists.js";
import { users } from "../../db/schema/users.js";
import type { EventBus } from "../../realtime/events.js";

interface TenantDeps {
  db: Database;
  events?: Pick<EventBus, "disconnectUser">;
}

const tenantSelection = {
  id: tenants.id,
  name: tenants.name,
  main: tenants.main,
};

export const getTenants = async (deps: TenantDeps): Promise<Tenant[]> =>
  deps.db
    .select(tenantSelection)
    .from(tenants)
    .orderBy(desc(tenants.main), asc(tenants.name));

export const createTenant = async (
  deps: TenantDeps,
  input: CreateTenantInput,
): Promise<Tenant> =>
  deps.db.transaction(async (tx) => {
    await assertNameFree(tx, input.name);

    const [created] = await tx
      .insert(tenants)
      .values({ id: randomUUID(), name: input.name, main: false })
      .returning(tenantSelection);

    if (!created) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
    return created;
  });

export const updateTenant = async (
  deps: TenantDeps,
  input: UpdateTenantInput,
): Promise<Tenant> =>
  deps.db.transaction(async (tx) => {
    await assertNameFree(tx, input.name, input.tenantId);

    const [updated] = await tx
      .update(tenants)
      .set({ name: input.name })
      .where(eq(tenants.id, input.tenantId))
      .returning(tenantSelection);

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tenant not existing.",
      });
    }
    return updated;
  });

export const deleteTenant = async (
  deps: TenantDeps,
  actorId: string,
  tenantId: string,
): Promise<Tenant> => {
  const { tenant, removedUserIds } = await deps.db.transaction(async (tx) => {
    const [target] = await tx
      .select(tenantSelection)
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("update")
      .limit(1);

    if (!target) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tenant not existing.",
      });
    }

    if (target.main) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The main tenant cannot be deleted.",
      });
    }

    const [actor] = await tx
      .select({ tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    if (actor?.tenantId === tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You cannot delete your own tenant.",
      });
    }

    // Lists take their memberships with them; users take their sessions,
    // accounts, invites, push subscriptions and applied mutations.
    await tx.delete(lists).where(eq(lists.tenantId, tenantId));
    const removed = await tx
      .delete(users)
      .where(eq(users.tenantId, tenantId))
      .returning({ id: users.id });
    await tx.delete(tenants).where(eq(tenants.id, tenantId));

    return { tenant: target, removedUserIds: removed.map((row) => row.id) };
  });

  for (const userId of removedUserIds) deps.events?.disconnectUser(userId);
  return tenant;
};

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

const assertNameFree = async (
  tx: Executor,
  name: string,
  exceptId?: string,
): Promise<void> => {
  const sameName = sql`lower(${tenants.name}) = lower(${name})`;
  const [clash] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(exceptId ? and(sameName, ne(tenants.id, exceptId)) : sameName)
    .limit(1);

  if (clash) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "There is another tenant with same name.",
    });
  }
};
