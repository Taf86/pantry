import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import { tenants } from "../../src/db/schema/tenants.js";
import { violatedConstraint } from "../helpers/constraints.js";
import {
  createHarness,
  MAIN_TENANT_ID,
  makeUser,
  type Harness,
} from "../helpers/harness.js";

describe("the phase 2 schema", () => {
  let harness: Harness;
  let userId: string;
  let listId: string;

  const makeList = async (): Promise<string> => {
    const id = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({
        id,
        tenantId: MAIN_TENANT_ID,
        name: "Spesa",
        createdBy: userId,
      });
    return id;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    userId = await makeUser(harness, MAIN_TENANT_ID, { status: "active" });
    listId = await makeList();
  });

  describe("membership", () => {
    it("rejects a permission mask carrying an undefined bit", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, tenant_id, permissions)
              VALUES (${listId}, ${userId}, ${MAIN_TENANT_ID}, ${1 | (1 << 6)})`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });

    it("rejects a permission mask without Read", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, tenant_id, permissions)
              VALUES (${listId}, ${userId}, ${MAIN_TENANT_ID}, ${2 | 4 | 8})`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });

    it("rejects an empty permission mask", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, tenant_id, permissions)
              VALUES (${listId}, ${userId}, ${MAIN_TENANT_ID}, 0)`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });
  });

  describe("tenants", () => {
    const OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000002";

    it("allows only one main tenant", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db
            .insert(tenants)
            .values({ id: OTHER_TENANT_ID, name: "Other", main: true }),
        ),
      ).toBe("idx_tenants_main");
    });

    it("rejects a member from another tenant", async () => {
      await harness.db
        .insert(tenants)
        .values({ id: OTHER_TENANT_ID, name: "Other", main: false });
      const outsider = await makeUser(harness, OTHER_TENANT_ID, {
        status: "active",
      });

      expect(
        await violatedConstraint(() =>
          harness.db.insert(listMembers).values({
            listId,
            userId: outsider,
            tenantId: MAIN_TENANT_ID,
            permissions: 1,
          }),
        ),
      ).toBe("list_members_user_tenant_users_fkey");

      expect(
        await violatedConstraint(() =>
          harness.db.insert(listMembers).values({
            listId,
            userId: outsider,
            tenantId: OTHER_TENANT_ID,
            permissions: 1,
          }),
        ),
      ).toBe("list_members_list_tenant_lists_fkey");
    });

    it("rejects a list created by a user of another tenant", async () => {
      await harness.db
        .insert(tenants)
        .values({ id: OTHER_TENANT_ID, name: "Other", main: false });

      expect(
        await violatedConstraint(() =>
          harness.db.insert(lists).values({
            id: crypto.randomUUID(),
            tenantId: OTHER_TENANT_ID,
            name: "Spesa",
            createdBy: userId,
          }),
        ),
      ).toBe("lists_created_by_tenant_users_fkey");
    });
  });
});
