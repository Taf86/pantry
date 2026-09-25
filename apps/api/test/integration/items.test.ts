import { Role, WriteOutcome, type AddItemInput } from "@pantry/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listItems } from "../../src/db/schema/list-items.js";
import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import {
  addItem,
  deleteItem,
  listItemsOf,
  updateItem,
} from "../../src/services/lists/items.service.js";
import {
  createRecordingEventBus,
  type RecordingEventBus,
} from "../../src/realtime/events.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MINUTE = 60_000;

describe("items", () => {
  let harness: Harness;
  let events: RecordingEventBus;
  let userId: string;
  let listId: string;

  const deps = () => ({ db: harness.db, events });
  const mutation = () => ({ mutationId: crypto.randomUUID() });
  const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

  const addInput = (overrides: Partial<AddItemInput> = {}): AddItemInput => ({
    ...mutation(),
    listId,
    id: crypto.randomUUID(),
    contentUpdatedAt: iso(),
    rawText: "2 kg patate",
    name: "patate",
    quantity: 2,
    unit: "kg",
    unitText: null,
    note: null,
    categoryId: null,
    ...overrides,
  });

  const add = async (overrides: Partial<AddItemInput> = {}) => {
    const written = await addItem(deps(), userId, addInput(overrides));
    events.reset();
    return written.item;
  };

  const edit = (id: string, at: string, name: string) =>
    updateItem(deps(), userId, {
      ...mutation(),
      listId,
      id,
      contentUpdatedAt: at,
      rawText: name,
      name,
      quantity: null,
      unit: null,
      unitText: null,
      note: null,
      categoryId: null,
    });

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    events = createRecordingEventBus();
    userId = await makeUser(harness, { status: "active" });
    listId = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id: listId, name: "Spesa", createdBy: userId });
    await harness.db
      .insert(listMembers)
      .values({ listId, userId, permissions: Role.Owner });
  });

  describe("adding", () => {
    it("stores the item under the id the client generated", async () => {
      const input = addInput();
      const written = await addItem(deps(), userId, input);

      expect(written.outcome).toBe(WriteOutcome.applied);
      expect(written.item.id).toBe(input.id);
      expect(written.item.name).toBe("patate");
    });

    it("keeps what the user typed alongside what was understood", async () => {
      const item = await add();

      expect(item.rawText).toBe("2 kg patate");
      expect({ quantity: item.quantity, unit: item.unit }).toEqual({
        quantity: 2,
        unit: "kg",
      });
    });

    it("returns the stored item without inserting twice when the mutation is replayed", async () => {
      const input = addInput();
      await addItem(deps(), userId, input);
      const replay = await addItem(deps(), userId, input);

      expect(replay.outcome).toBe(WriteOutcome.deduplicated);
      expect(
        await listItemsOf(deps(), { listId, includeDeleted: false }),
      ).toHaveLength(1);
    });

    it("treats two concurrent adds of the same product as two items", async () => {
      await add({ name: "latte" });
      await add({ name: "latte" });

      expect(
        await listItemsOf(deps(), { listId, includeDeleted: false }),
      ).toHaveLength(2);
    });

    it("tells the client the server time on every write", async () => {
      const written = await addItem(deps(), userId, addInput());

      expect(Number.isNaN(Date.parse(written.serverTime))).toBe(false);
    });

    it("clamps a device timestamp from the future down to server time", async () => {
      const written = await addItem(
        deps(),
        userId,
        addInput({ contentUpdatedAt: iso(60 * MINUTE) }),
      );

      expect(Date.parse(written.item.contentUpdatedAt)).toBeLessThanOrEqual(
        Date.parse(written.serverTime),
      );
    });
  });

  describe("editing under group last-write-wins", () => {
    it("applies an edit that is newer than what is stored", async () => {
      const item = await add();
      const written = await edit(item.id, iso(MINUTE), "patate rosse");

      expect(written.outcome).toBe(WriteOutcome.applied);
      expect(written.item.name).toBe("patate rosse");
    });

    it("keeps the stored content when an older offline edit arrives", async () => {
      const item = await add();
      await edit(item.id, iso(MINUTE), "recente");

      const late = await edit(item.id, iso(-10 * MINUTE), "vecchia");

      expect(late.outcome).toBe(WriteOutcome.stale);
      expect(late.item.name).toBe("recente");
    });

    it("never raises a conflict for a skipped content write", async () => {
      const item = await add();
      await edit(item.id, iso(MINUTE), "recente");

      // The whole point of dropping optimistic locking: this resolves, it does
      // not reject, so a drained queue produces no dialogs at all.
      await expect(
        edit(item.id, iso(-MINUTE), "vecchia"),
      ).resolves.toMatchObject({
        outcome: WriteOutcome.stale,
      });
    });

    it("applies a write whose timestamp ties with the stored one", async () => {
      const item = await add();
      const at = iso(MINUTE);
      await edit(item.id, at, "prima");

      expect((await edit(item.id, at, "seconda")).item.name).toBe("seconda");
    });

    it("advances the sync cursor with server time, not the device timestamp", async () => {
      // Written by a device whose clock reads five minutes ago: the pivot keeps
      // the device instant, the cursor must still be the server one, or a sync
      // that asks for everything since its last poll would miss the row.
      const item = await add({ contentUpdatedAt: iso(-5 * MINUTE) });

      const [row] = await harness.db
        .select()
        .from(listItems)
        .where(eq(listItems.id, item.id));

      expect(Date.parse(row!.contentUpdatedAt.toISOString())).toBeLessThan(
        Date.parse(row!.updatedAt.toISOString()),
      );
    });

    it("returns the stored item without re-applying a replayed edit", async () => {
      const item = await add();
      const input = {
        ...mutation(),
        listId,
        id: item.id,
        contentUpdatedAt: iso(MINUTE),
        rawText: "prima",
        name: "prima",
        quantity: null,
        unit: null,
        unitText: null,
        note: null,
        categoryId: null,
      };
      await updateItem(deps(), userId, input);
      await edit(item.id, iso(2 * MINUTE), "dopo");

      const replay = await updateItem(deps(), userId, input);

      expect(replay.outcome).toBe(WriteOutcome.deduplicated);
      expect(replay.item.name).toBe("dopo");
    });

    it("refuses to edit an item that does not exist", async () => {
      await expect(
        edit(crypto.randomUUID(), iso(), "fantasma"),
      ).rejects.toThrow(/not existing/i);
    });
  });

  describe("deleting", () => {
    it("tombstones the item instead of removing the row", async () => {
      const item = await add();
      await deleteItem(deps(), userId, {
        ...mutation(),
        listId,
        id: item.id,
        at: iso(),
      });

      const [row] = await harness.db
        .select()
        .from(listItems)
        .where(eq(listItems.id, item.id));

      expect(row?.deletedAt).not.toBeNull();
    });

    it("hides the tombstone unless it is asked for", async () => {
      const item = await add();
      await deleteItem(deps(), userId, {
        ...mutation(),
        listId,
        id: item.id,
        at: iso(),
      });

      expect(
        await listItemsOf(deps(), { listId, includeDeleted: false }),
      ).toEqual([]);
      expect(
        await listItemsOf(deps(), { listId, includeDeleted: true }),
      ).toHaveLength(1);
    });

    it("refuses to resurrect a tombstoned item with a later edit", async () => {
      const item = await add();
      await deleteItem(deps(), userId, {
        ...mutation(),
        listId,
        id: item.id,
        at: iso(),
      });

      const late = await edit(item.id, iso(60 * MINUTE), "tornato");

      expect(late.outcome).toBe(WriteOutcome.stale);
      expect(late.item.deletedAt).not.toBeNull();
      expect(late.item.name).toBe("patate");
    });

    it("applies a delete that arrives after a newer edit", async () => {
      const item = await add();
      await edit(item.id, iso(10 * MINUTE), "modificato");

      const removed = await deleteItem(deps(), userId, {
        ...mutation(),
        listId,
        id: item.id,
        at: iso(-10 * MINUTE),
      });

      expect(removed.outcome).toBe(WriteOutcome.applied);
    });

    it("reports a second delete as stale rather than failing", async () => {
      const item = await add();
      const del = () =>
        deleteItem(deps(), userId, {
          ...mutation(),
          listId,
          id: item.id,
          at: iso(),
        });

      await del();
      expect((await del()).outcome).toBe(WriteOutcome.stale);
    });
  });

  describe("ordering", () => {
    it("orders items by aisle and then by id", async () => {
      const dairy = await add({ name: "latte", categoryId: "dairy" });
      const produce = await add({ name: "mele", categoryId: "produce" });

      const ordered = await listItemsOf(deps(), {
        listId,
        includeDeleted: false,
      });

      expect(ordered.map((i) => i.id)).toEqual([produce.id, dairy.id]);
    });

    it("sorts uncategorised items after every category", async () => {
      const loose = await add({ name: "boh", categoryId: null });
      const household = await add({
        name: "detersivo",
        categoryId: "household",
      });

      const ordered = await listItemsOf(deps(), {
        listId,
        includeDeleted: false,
      });

      expect(ordered.map((i) => i.id)).toEqual([household.id, loose.id]);
    });
  });

  describe("notifications", () => {
    it("announces an applied write to the room of its list", async () => {
      await addItem(deps(), userId, addInput());

      expect(events.events).toEqual([
        expect.objectContaining({ type: "item.upserted", listId }),
      ]);
    });

    it("publishes nothing when a content write is skipped as stale", async () => {
      const item = await add();
      await edit(item.id, iso(MINUTE), "recente");
      events.reset();

      await edit(item.id, iso(-MINUTE), "vecchia");

      expect(events.events).toEqual([]);
    });

    it("announces a delete as a delete, not as an upsert", async () => {
      const item = await add();
      await deleteItem(deps(), userId, {
        ...mutation(),
        listId,
        id: item.id,
        at: iso(),
      });

      expect(events.events).toEqual([
        expect.objectContaining({ type: "item.deleted", itemId: item.id }),
      ]);
    });
  });
});
