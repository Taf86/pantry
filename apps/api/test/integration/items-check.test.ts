import { Role, WriteOutcome, type AddItemInput } from "@pantry/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listItems } from "../../src/db/schema/list-items.js";
import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import { shoppingSessions } from "../../src/db/schema/shopping-sessions.js";
import {
  checkItem,
  checkMany,
  uncheckItem,
} from "../../src/services/lists/checks.service.js";
import { addItem, updateItem } from "../../src/services/lists/items.service.js";
import {
  claimSession,
  releaseSession,
} from "../../src/services/shopping/sessions.service.js";
import {
  createRecordingEventBus,
  type RecordingEventBus,
} from "../../src/realtime/events.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MINUTE = 60_000;

describe("checking items off", () => {
  let harness: Harness;
  let events: RecordingEventBus;
  let marco: string;
  let anna: string;
  let listId: string;

  const deps = () => ({ db: harness.db, events });
  const mutation = () => ({ mutationId: crypto.randomUUID() });
  const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

  const add = async (overrides: Partial<AddItemInput> = {}) => {
    const written = await addItem(deps(), marco, {
      ...mutation(),
      listId,
      id: crypto.randomUUID(),
      contentUpdatedAt: iso(),
      rawText: "latte",
      name: "latte",
      quantity: 1,
      unit: "l",
      unitText: null,
      note: null,
      categoryId: null,
      ...overrides,
    });
    events.reset();
    return written.item;
  };

  const check = (id: string, checkedAt: string, who = marco) =>
    checkItem(deps(), who, { ...mutation(), listId, id, checkedAt });

  const uncheck = (id: string, at: string, who = marco) =>
    uncheckItem(deps(), who, { ...mutation(), listId, id, at });

  const rowOf = async (id: string) =>
    (await harness.db.select().from(listItems).where(eq(listItems.id, id)))[0]!;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    events = createRecordingEventBus();
    marco = await makeUser(harness, { status: "active" });
    anna = await makeUser(harness, { status: "active" });
    listId = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id: listId, name: "Spesa", createdBy: marco });
    await harness.db.insert(listMembers).values([
      { listId, userId: marco, permissions: Role.Owner },
      { listId, userId: anna, permissions: Role.Shopper },
    ]);
  });

  describe("without any shopping session", () => {
    it("checks the item when no session is open at all", async () => {
      const item = await add();
      const written = await check(item.id, iso());

      expect(written.outcome).toBe(WriteOutcome.applied);
      expect(written.item.checkedAt).not.toBeNull();
      expect(written.item.checkedBy).toBe(marco);
    });

    it("leaves the session reference empty when nothing covered that instant", async () => {
      const item = await add();
      await check(item.id, iso());

      expect((await rowOf(item.id)).checkedIn).toBeNull();
    });

    it("checks for a member who cannot write to the list", async () => {
      const item = await add();

      await expect(check(item.id, iso(), anna)).resolves.toMatchObject({
        outcome: WriteOutcome.applied,
      });
    });

    it("clears who ticked it when the item is unticked", async () => {
      const item = await add();
      await check(item.id, iso());

      const written = await uncheck(item.id, iso(MINUTE));

      expect(written.item.checkedAt).toBeNull();
      expect(written.item.checkedBy).toBeNull();
    });
  });

  describe("last-write-wins on its own clock", () => {
    it("keeps a later untick when an older offline tick arrives", async () => {
      const item = await add();
      await uncheck(item.id, iso());
      await check(item.id, iso(-MINUTE));

      // 18:03 tick from the shop, 18:20 untick at home, queue drains at 18:40.
      // The untick must survive.
      expect((await rowOf(item.id)).checkedAt).toBeNull();
    });

    it("keeps a later tick when an older offline untick arrives", async () => {
      const item = await add();
      await check(item.id, iso());
      const late = await uncheck(item.id, iso(-MINUTE));

      expect(late.outcome).toBe(WriteOutcome.stale);
      expect(late.item.checkedAt).not.toBeNull();
    });

    it("reports a losing tick as stale rather than as a conflict", async () => {
      const item = await add();
      await uncheck(item.id, iso());

      await expect(check(item.id, iso(-MINUTE))).resolves.toMatchObject({
        outcome: WriteOutcome.stale,
      });
    });

    it("leaves the content clock untouched when the item is ticked", async () => {
      const item = await add();
      const before = (await rowOf(item.id)).contentUpdatedAt;

      await check(item.id, iso(MINUTE));

      expect((await rowOf(item.id)).contentUpdatedAt.getTime()).toBe(
        before.getTime(),
      );
    });

    it("refuses to tick a tombstoned item", async () => {
      const item = await add();
      await harness.db
        .update(listItems)
        .set({ deletedAt: new Date() })
        .where(eq(listItems.id, item.id));

      expect((await check(item.id, iso(MINUTE))).outcome).toBe(
        WriteOutcome.stale,
      );
    });

    it("returns the stored item without re-applying a replayed tick", async () => {
      const item = await add();
      const input = { ...mutation(), listId, id: item.id, checkedAt: iso() };
      await checkItem(deps(), marco, input);
      await uncheck(item.id, iso(MINUTE));

      const replay = await checkItem(deps(), marco, input);

      expect(replay.outcome).toBe(WriteOutcome.deduplicated);
      expect(replay.item.checkedAt).toBeNull();
    });
  });

  describe("the two clocks staying apart", () => {
    it("leaves the check clock untouched when the content is edited", async () => {
      const item = await add();
      await check(item.id, iso());
      const before = (await rowOf(item.id)).checkUpdatedAt;

      await updateItem(deps(), marco, {
        ...mutation(),
        listId,
        id: item.id,
        contentUpdatedAt: iso(10 * MINUTE),
        rawText: "latte intero",
        name: "latte intero",
        quantity: null,
        unit: null,
        unitText: null,
        note: null,
        categoryId: null,
      });

      const row = await rowOf(item.id);
      expect(row.checkUpdatedAt.getTime()).toBe(before.getTime());
      expect(row.checkedAt).not.toBeNull();
    });

    it("does not let an edit at home clobber a tick queued in the shop", async () => {
      const item = await add();
      // The item was added at 18:00. Renamed at home at 18:20; ticked in the
      // shop at 18:03, arriving only now. The tick is the OLDER of the two in
      // wall-clock terms, and both must still land: they run on separate clocks.
      await updateItem(deps(), marco, {
        ...mutation(),
        listId,
        id: item.id,
        contentUpdatedAt: iso(20 * MINUTE),
        rawText: "latte intero",
        name: "latte intero",
        quantity: null,
        unit: null,
        unitText: null,
        note: null,
        categoryId: null,
      });

      await check(item.id, iso(3 * MINUTE));

      const row = await rowOf(item.id);
      expect(row.name).toBe("latte intero");
      expect(row.checkedAt).not.toBeNull();
    });
  });

  describe("which run it belongs to", () => {
    it("stamps the tick with the session open at the instant the device recorded", async () => {
      const item = await add();
      const session = await claimSession(deps(), marco, { listId });

      await check(item.id, iso());

      expect((await rowOf(item.id)).checkedIn).toBe(session.id);
    });

    it("attributes an offline tick to the run it was made during", async () => {
      const item = await add();
      const first = await claimSession(deps(), marco, { listId });

      const tickedAt = iso();
      await harness.db
        .update(shoppingSessions)
        .set({ expiresAt: new Date(Date.now() - MINUTE) })
        .where(eq(shoppingSessions.id, first.id));
      await claimSession(deps(), anna, { listId });

      // His queue drains now. The tick belongs to HIS run, or the pantry
      // bridge would later move into the cupboard things Anna never bought.
      await check(item.id, tickedAt);

      expect((await rowOf(item.id)).checkedIn).toBe(first.id);
    });

    it("accepts the ticks of a shopper whose lease was taken from them", async () => {
      const item = await add();
      const first = await claimSession(deps(), marco, { listId });
      await harness.db
        .update(shoppingSessions)
        .set({ expiresAt: new Date(Date.now() - MINUTE) })
        .where(eq(shoppingSessions.id, first.id));
      await claimSession(deps(), anna, { listId });

      // The lease coordinates, it never guards. Rejecting this would lose the
      // whole queue on the way home, which is the worst failure there is.
      await expect(check(item.id, iso())).resolves.toMatchObject({
        outcome: WriteOutcome.applied,
      });
    });

    it("leaves the stamp empty for a tick made after the run ended", async () => {
      const item = await add();
      const session = await claimSession(deps(), marco, { listId });
      await releaseSession(deps(), marco, {
        listId,
        sessionId: session.id,
        completed: true,
      });

      await check(item.id, iso(MINUTE));

      expect((await rowOf(item.id)).checkedIn).toBeNull();
    });
  });

  describe("draining the queue in one batch", () => {
    it("applies every tick in the batch", async () => {
      const first = await add({ name: "latte" });
      const second = await add({ name: "pane" });

      const written = await checkMany(deps(), marco, {
        ...mutation(),
        checks: [
          { listId, id: first.id, checkedAt: iso(), at: iso() },
          { listId, id: second.id, checkedAt: iso(), at: iso() },
        ],
      });

      expect(written.applied).toHaveLength(2);
    });

    it("carries unticks in the same batch", async () => {
      const item = await add();
      await check(item.id, iso(-MINUTE));

      const written = await checkMany(deps(), marco, {
        ...mutation(),
        checks: [{ listId, id: item.id, checkedAt: null, at: iso() }],
      });

      expect(written.applied[0]?.checkedAt).toBeNull();
    });

    it("skips the rows that lose their comparison without failing the batch", async () => {
      const fresh = await add({ name: "latte" });
      const stale = await add({ name: "pane" });
      await uncheck(stale.id, iso(MINUTE));

      const written = await checkMany(deps(), marco, {
        ...mutation(),
        checks: [
          { listId, id: fresh.id, checkedAt: iso(), at: iso() },
          { listId, id: stale.id, checkedAt: iso(-MINUTE), at: iso(-MINUTE) },
        ],
      });

      expect(written.applied.map((i) => i.id)).toEqual([fresh.id]);
    });

    it("applies the batch once when the queue retries it", async () => {
      const item = await add();
      const input = {
        ...mutation(),
        checks: [{ listId, id: item.id, checkedAt: iso(), at: iso() }],
      };

      await checkMany(deps(), marco, input);
      await uncheck(item.id, iso(MINUTE));
      const replay = await checkMany(deps(), marco, input);

      expect(replay.applied).toEqual([]);
      expect((await rowOf(item.id)).checkedAt).toBeNull();
    });
  });

  describe("notifications", () => {
    it("announces a tick as an upsert to the room of its list", async () => {
      const item = await add();
      await check(item.id, iso());

      expect(events.events).toEqual([
        expect.objectContaining({ type: "item.upserted", listId }),
      ]);
    });

    it("publishes nothing for a tick skipped as stale", async () => {
      const item = await add();
      await uncheck(item.id, iso());
      events.reset();

      await check(item.id, iso(-MINUTE));

      expect(events.events).toEqual([]);
    });
  });
});
