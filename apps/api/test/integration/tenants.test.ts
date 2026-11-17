import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { tenants } from "../../src/db/schema/tenants.js";
import { users } from "../../src/db/schema/users.js";
import { createRecordingEventBus } from "../../src/realtime/events.js";
import { getUsers } from "../../src/services/admin/admin.service.js";
import {
  createTenant,
  deleteTenant,
  getTenants,
  updateTenant,
} from "../../src/services/tenants/tenants.service.js";
import {
  createHarness,
  MAIN_TENANT_ID,
  makeUser,
  OTHER_TENANT_ID,
  type Harness,
} from "../helpers/harness.js";

describe("tenants", () => {
  let harness: Harness;
  let admin: string;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    admin = await makeUser(harness, MAIN_TENANT_ID, {
      role: "admin",
      status: "active",
    });
  });

  const deps = () => ({ db: harness.db });

  const addOtherTenant = () =>
    harness.db
      .insert(tenants)
      .values({ id: OTHER_TENANT_ID, name: "Other", main: false });

  describe("create", () => {
    it("creates a tenant that is never main", async () => {
      const created = await createTenant(deps(), { name: "Famiglia" });

      expect(created.name).toBe("Famiglia");
      expect(created.main).toBe(false);
      expect((await getTenants(deps(), admin)).map((t) => t.id)).toEqual([
        MAIN_TENANT_ID,
        created.id,
      ]);
    });

    it("refuses a name already taken, whatever the case", async () => {
      await expect(createTenant(deps(), { name: "main" })).rejects.toThrow(
        /same name/i,
      );
    });
  });

  describe("update", () => {
    it("renames a tenant", async () => {
      await addOtherTenant();

      const updated = await updateTenant(deps(), {
        tenantId: OTHER_TENANT_ID,
        name: "Renamed",
      });

      expect(updated).toEqual({
        id: OTHER_TENANT_ID,
        name: "Renamed",
        main: false,
      });
    });

    it("lets a tenant keep its own name with a different case", async () => {
      await addOtherTenant();

      await expect(
        updateTenant(deps(), { tenantId: OTHER_TENANT_ID, name: "OTHER" }),
      ).resolves.toMatchObject({ name: "OTHER" });
    });

    it("refuses a name taken by another tenant", async () => {
      await addOtherTenant();

      await expect(
        updateTenant(deps(), { tenantId: OTHER_TENANT_ID, name: "Main" }),
      ).rejects.toThrow(/same name/i);
    });

    it("refuses a tenant that does not exist", async () => {
      await expect(
        updateTenant(deps(), { tenantId: OTHER_TENANT_ID, name: "Ghost" }),
      ).rejects.toThrow(/not existing/i);
    });
  });

  describe("delete", () => {
    it("deletes an empty tenant", async () => {
      await addOtherTenant();

      await deleteTenant(deps(), admin, OTHER_TENANT_ID);

      const left = await harness.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, OTHER_TENANT_ID));
      expect(left).toEqual([]);
    });

    it("never deletes the main tenant", async () => {
      await addOtherTenant();
      const outsider = await makeUser(harness, OTHER_TENANT_ID, {
        role: "admin",
        status: "active",
      });

      await expect(
        deleteTenant(deps(), outsider, MAIN_TENANT_ID),
      ).rejects.toThrow(/main tenant/i);
    });

    it("does not let an admin delete their own tenant", async () => {
      await addOtherTenant();
      const outsider = await makeUser(harness, OTHER_TENANT_ID, {
        role: "admin",
        status: "active",
      });

      await expect(
        deleteTenant(deps(), outsider, OTHER_TENANT_ID),
      ).rejects.toThrow(/own tenant/i);
    });

    it("deletes a tenant with everything in it, and nothing outside it", async () => {
      await addOtherTenant();
      const owner = await makeUser(harness, OTHER_TENANT_ID, {
        status: "active",
      });
      const guest = await makeUser(harness, OTHER_TENANT_ID, {
        status: "active",
      });
      const listId = crypto.randomUUID();
      await harness.db.insert(lists).values({
        id: listId,
        tenantId: OTHER_TENANT_ID,
        name: "Spesa",
        createdBy: owner,
      });
      await harness.db.insert(listMembers).values([
        { listId, userId: owner, tenantId: OTHER_TENANT_ID, permissions: 15 },
        { listId, userId: guest, tenantId: OTHER_TENANT_ID, permissions: 1 },
      ]);
      await harness.db.insert(sessions).values({
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId: owner,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const events = createRecordingEventBus();

      await deleteTenant({ db: harness.db, events }, admin, OTHER_TENANT_ID);

      expect(
        await harness.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.tenantId, OTHER_TENANT_ID)),
      ).toEqual([]);
      expect(
        await harness.db.select().from(lists).where(eq(lists.id, listId)),
      ).toEqual([]);
      expect(
        await harness.db
          .select()
          .from(listMembers)
          .where(eq(listMembers.listId, listId)),
      ).toEqual([]);
      expect(
        await harness.db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, owner)),
      ).toEqual([]);
      expect([...events.disconnectedUsers].sort()).toEqual(
        [owner, guest].sort(),
      );

      expect(
        await harness.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, admin)),
      ).toEqual([{ id: admin }]);
    });

    it("refuses a tenant that does not exist", async () => {
      await expect(
        deleteTenant(deps(), admin, OTHER_TENANT_ID),
      ).rejects.toThrow(/not existing/i);
    });
  });

  describe("users list", () => {
    const list = (input: Partial<Parameters<typeof getUsers>[1]>) =>
      getUsers(deps(), {
        pagination: { pageIndex: 0, pageSize: 50 },
        sorting: [],
        filters: {},
        ...input,
      });

    it("filters users by tenant", async () => {
      await addOtherTenant();
      const other = await makeUser(harness, OTHER_TENANT_ID);

      const page = await list({ filters: { tenant: [OTHER_TENANT_ID] } });

      expect(page.rowCount).toBe(1);
      expect(page.rows.map((row) => row.id)).toEqual([other]);
      expect(page.rows[0]?.tenant).toEqual({
        id: OTHER_TENANT_ID,
        name: "Other",
      });
    });

    it("sorts users by tenant name", async () => {
      await harness.db
        .insert(tenants)
        .values({ id: OTHER_TENANT_ID, name: "Aaa", main: false });
      const other = await makeUser(harness, OTHER_TENANT_ID);

      const ascending = await list({
        sorting: [{ id: "tenant", desc: false }],
      });
      const descending = await list({
        sorting: [{ id: "tenant", desc: true }],
      });

      expect(ascending.rows.map((row) => row.id)).toEqual([other, admin]);
      expect(descending.rows.map((row) => row.id)).toEqual([admin, other]);
    });
  });
});
