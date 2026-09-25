import { SYSTEM_CATEGORIES, SessionEndReason } from "@pantry/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { categories } from "../../src/db/schema/categories.js";
import { listItems } from "../../src/db/schema/list-items.js";
import { lists } from "../../src/db/schema/lists.js";
import { shoppingSessions } from "../../src/db/schema/shopping-sessions.js";
import { violatedConstraint } from "../helpers/constraints.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const HOUR = 3_600_000;

describe("the phase 2 schema", () => {
  let harness: Harness;
  let userId: string;
  let listId: string;

  const makeList = async (): Promise<string> => {
    const id = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id, name: "Spesa", createdBy: userId });
    return id;
  };

  const openSession = (overrides: { expiresAt?: Date } = {}) =>
    harness.db
      .insert(shoppingSessions)
      .values({
        id: crypto.randomUUID(),
        listId,
        userId,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + HOUR),
      })
      .returning({ id: shoppingSessions.id });

  const addItem = (overrides: Record<string, unknown> = {}) =>
    harness.db.insert(listItems).values({
      id: crypto.randomUUID(),
      listId,
      rawText: "2 kg patate",
      name: "patate",
      quantity: 2,
      unit: "kg",
      ...overrides,
    } as typeof listItems.$inferInsert);

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    userId = await makeUser(harness, { status: "active" });
    listId = await makeList();
  });

  describe("the shopping lease", () => {
    it("rejects a second active session on the same list", async () => {
      await openSession();

      expect(await violatedConstraint(() => openSession())).toBe(
        "idx_shopping_sessions_active",
      );
    });

    it("accepts a new session once the previous one has ended", async () => {
      const [first] = await openSession();

      await harness.db
        .update(shoppingSessions)
        .set({ endedAt: new Date(), endReason: SessionEndReason.released })
        .where(eq(shoppingSessions.id, first!.id));

      await expect(openSession()).resolves.toBeDefined();
    });

    it("lets two different lists be taken in charge at once", async () => {
      await openSession();
      const other = await makeList();

      await expect(
        harness.db.insert(shoppingSessions).values({
          id: crypto.randomUUID(),
          listId: other,
          userId,
          expiresAt: new Date(Date.now() + HOUR),
        }),
      ).resolves.toBeDefined();
    });

    it("refuses an ending that gives no reason", async () => {
      const [session] = await openSession();

      expect(
        await violatedConstraint(() =>
          harness.db
            .update(shoppingSessions)
            .set({ endedAt: new Date() })
            .where(eq(shoppingSessions.id, session!.id)),
        ),
      ).toBe("shopping_sessions_ended_check");
    });
  });

  describe("the taxonomy", () => {
    it("is seeded after every truncation", async () => {
      const rows = await harness.db.select().from(categories);

      expect(rows).toHaveLength(SYSTEM_CATEGORIES.length);
      expect(rows.every((row) => row.slug !== null && row.name === null)).toBe(
        true,
      );
    });

    it("uses the slug as the id, so re-seeding cannot duplicate a row", async () => {
      const [produce] = await harness.db
        .select()
        .from(categories)
        .where(eq(categories.id, "produce"));

      expect(produce?.slug).toBe("produce");
    });

    it("rejects a category carrying neither a slug nor a name", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db
            .insert(categories)
            .values({ id: crypto.randomUUID(), slug: null, name: null }),
        ),
      ).toBe("categories_label_check");
    });

    it("rejects a category carrying both a slug and a name", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.insert(categories).values({
            id: crypto.randomUUID(),
            slug: "custom",
            name: "Custom",
          }),
        ),
      ).toBe("categories_label_check");
    });
  });

  describe("an item", () => {
    it("rejects a canonical unit and raw unit text at once", async () => {
      expect(
        await violatedConstraint(() =>
          addItem({ unit: "kg", unitText: "mazzi" }),
        ),
      ).toBe("list_items_unit_exclusive_check");
    });

    it("rejects a negative quantity", async () => {
      expect(await violatedConstraint(() => addItem({ quantity: -1 }))).toBe(
        "list_items_quantity_check",
      );
    });

    it("rejects a tick that records no one", async () => {
      expect(
        await violatedConstraint(() =>
          addItem({ checkedAt: new Date(), checkedBy: null }),
        ),
      ).toBe("list_items_checked_check");
    });

    it("clears its session reference when the ended session is swept", async () => {
      const [session] = await openSession();
      await addItem({
        checkedAt: new Date(),
        checkedBy: userId,
        checkedIn: session!.id,
      });

      await harness.db
        .delete(shoppingSessions)
        .where(eq(shoppingSessions.id, session!.id));

      const [item] = await harness.db.select().from(listItems);
      expect(item?.checkedIn).toBeNull();
      expect(item?.checkedAt).not.toBeNull();
    });

    it("keeps its id ordering aligned with its creation ordering", async () => {
      const ids = [
        "0199a0d0-0000-7000-8000-000000000001",
        "0199a0d0-0000-7000-8000-000000000002",
      ];
      for (const id of ids) await addItem({ id });

      const rows = await harness.db
        .select({ id: listItems.id })
        .from(listItems)
        .orderBy(listItems.id);

      expect(rows.map((row) => row.id)).toEqual(ids);
    });
  });

  describe("membership", () => {
    it("rejects a permission mask carrying an undefined bit", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, permissions)
              VALUES (${listId}, ${userId}, ${1 << 6})`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });
  });
});
