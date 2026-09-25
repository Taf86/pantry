import { APPLIED_MUTATION_TTL_DAYS, Permission, Role } from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { appliedMutations } from "../../src/db/schema/applied-mutations.js";
import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import {
  assertListPermissions,
  getListMembership,
  requireListPermission,
} from "../../src/services/lists/membership.js";
import {
  claimMutation,
  sweepAppliedMutations,
} from "../../src/services/lists/mutations.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MS_PER_DAY = 86_400_000;

describe("list membership", () => {
  let harness: Harness;
  let member: string;
  let stranger: string;
  let listId: string;

  const makeList = async (): Promise<string> => {
    const id = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id, name: "Spesa", createdBy: member });
    return id;
  };

  const share = (id: string, userId: string, permissions: number) =>
    harness.db.insert(listMembers).values({ listId: id, userId, permissions });

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    member = await makeUser(harness, { status: "active" });
    stranger = await makeUser(harness, { status: "active" });
    listId = await makeList();
    await share(listId, member, Role.Owner);
  });

  it("grants a member exactly the mask they were given", async () => {
    expect(await getListMembership(harness.db, listId, member)).toEqual({
      permissions: Role.Owner,
    });
  });

  it("grants nothing to someone the list was never shared with", async () => {
    expect(await getListMembership(harness.db, listId, stranger)).toBeNull();
  });

  it("grants nothing once the list is gone, because the membership went with it", async () => {
    await harness.db.delete(lists).where(eq(lists.id, listId));

    expect(await getListMembership(harness.db, listId, member)).toBeNull();
    expect(await harness.db.select().from(listMembers)).toEqual([]);
  });

  it("denies a member whose mask lacks one of the required bits", async () => {
    await share(await makeList(), stranger, Role.Shopper);
    const shopperList = (
      await harness.db
        .select({ id: listMembers.listId })
        .from(listMembers)
        .where(eq(listMembers.userId, stranger))
    )[0]!.id;

    await expect(
      requireListPermission(
        harness.db,
        shopperList,
        stranger,
        Permission.Write,
      ),
    ).rejects.toThrow(TRPCError);
  });

  it("lets a shopper tick items off on a list they cannot write to", async () => {
    const shopped = await makeList();
    await share(shopped, stranger, Role.Shopper);

    await expect(
      requireListPermission(harness.db, shopped, stranger, Permission.Shop),
    ).resolves.toBe(Role.Shopper);
  });

  describe("assertListPermissions", () => {
    it("passes when every list allows the operation", async () => {
      const second = await makeList();
      await share(second, member, Role.Editor);

      await expect(
        assertListPermissions(
          harness.db,
          [listId, second],
          member,
          Permission.Shop,
        ),
      ).resolves.toBeUndefined();
    });

    it("rejects a batch touching a single list the caller cannot write to", async () => {
      const second = await makeList();
      await share(second, member, Role.Viewer);

      await expect(
        assertListPermissions(
          harness.db,
          [listId, second],
          member,
          Permission.Shop,
        ),
      ).rejects.toThrow(/1 list/i);
    });

    it("accepts an empty batch without touching the database", async () => {
      await expect(
        assertListPermissions(harness.db, [], member, Permission.Manage),
      ).resolves.toBeUndefined();
    });

    it("counts a repeated list once", async () => {
      await expect(
        assertListPermissions(
          harness.db,
          [listId, listId, listId],
          member,
          Permission.Shop,
        ),
      ).resolves.toBeUndefined();
    });
  });
});

describe("mutation deduplication", () => {
  let harness: Harness;
  let userId: string;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    userId = await makeUser(harness, { status: "active" });
  });

  it("claims a mutation the first time and refuses the replay", async () => {
    const mutationId = crypto.randomUUID();

    expect(await claimMutation(harness.db, mutationId, userId)).toBe(true);
    expect(await claimMutation(harness.db, mutationId, userId)).toBe(false);
  });

  it("treats two distinct mutations as two operations", async () => {
    expect(await claimMutation(harness.db, crypto.randomUUID(), userId)).toBe(
      true,
    );
    expect(await claimMutation(harness.db, crypto.randomUUID(), userId)).toBe(
      true,
    );
  });

  it("releases the claim when the surrounding operation fails", async () => {
    const mutationId = crypto.randomUUID();

    await expect(
      harness.db.transaction(async (tx) => {
        await claimMutation(tx, mutationId, userId);
        throw new Error("the operation itself blew up");
      }),
    ).rejects.toThrow(/blew up/);

    // Either both the claim and the operation hold, or neither does. A claim
    // that survived a rolled-back operation would silently swallow the retry.
    expect(await claimMutation(harness.db, mutationId, userId)).toBe(true);
  });

  it("removes deduplication rows past their retention", async () => {
    const old = crypto.randomUUID();
    await claimMutation(harness.db, old, userId);
    await claimMutation(harness.db, crypto.randomUUID(), userId);

    await harness.db
      .update(appliedMutations)
      .set({
        appliedAt: new Date(
          Date.now() - (APPLIED_MUTATION_TTL_DAYS + 1) * MS_PER_DAY,
        ),
      })
      .where(eq(appliedMutations.id, old));

    expect(await sweepAppliedMutations(harness.db)).toBe(1);
    expect(
      await harness.db
        .select({ n: sql<number>`count(*)::int` })
        .from(appliedMutations),
    ).toEqual([{ n: 1 }]);
  });
});
