import { Role, type AddItemInput } from "@pantry/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listItems } from "../../src/db/schema/list-items.js";
import { listMembers } from "../../src/db/schema/list-members.js";
import { listProducts } from "../../src/db/schema/list-products.js";
import { lists } from "../../src/db/schema/lists.js";
import { products } from "../../src/db/schema/products.js";
import { addItem, updateItem } from "../../src/services/lists/items.service.js";
import { catalogForList } from "../../src/services/lists/products.service.js";
import { createRecordingEventBus } from "../../src/realtime/events.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MINUTE = 60_000;

describe("the product catalogue", () => {
  let harness: Harness;
  let userId: string;
  let listId: string;
  let otherListId: string;

  const events = createRecordingEventBus();
  const deps = () => ({ db: harness.db, events });
  const mutation = () => ({ mutationId: crypto.randomUUID() });
  const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

  const addInput = (overrides: Partial<AddItemInput> = {}): AddItemInput => ({
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

  const add = (overrides: Partial<AddItemInput> = {}) =>
    addItem(deps(), userId, addInput(overrides));

  const makeList = async (): Promise<string> => {
    const id = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id, name: "Spesa", createdBy: userId });
    await harness.db
      .insert(listMembers)
      .values({ listId: id, userId, permissions: Role.Owner });
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
    events.reset();
    userId = await makeUser(harness, { status: "active" });
    listId = await makeList();
    otherListId = await makeList();
  });

  describe("resolution", () => {
    it("resolves the product from the item name without the client sending one", async () => {
      const written = await add();

      const [row] = await harness.db
        .select()
        .from(listItems)
        .where(eq(listItems.id, written.item.id));

      expect(row?.productId).not.toBeNull();
    });

    it("folds two spellings of the same product onto one catalogue row", async () => {
      await add({ name: "Caffè" });
      await add({ name: "caffe" });

      expect(await harness.db.select().from(products)).toHaveLength(1);
    });

    it("leaves the item usable when its name normalizes to nothing", async () => {
      const written = await add({ name: "???", rawText: "???" });

      const [row] = await harness.db
        .select()
        .from(listItems)
        .where(eq(listItems.id, written.item.id));

      expect(row?.productId).toBeNull();
      expect(written.item.name).toBe("???");
    });

    it("never returns a product id to the caller", async () => {
      const written = await add();

      expect(written.item).not.toHaveProperty("productId");
      expect(await catalogForList(harness.db, listId)).toEqual([
        expect.not.objectContaining({ id: expect.anything() }),
      ]);
    });
  });

  describe("the category it lends the item", () => {
    it("adopts the catalogue category when the client picked none", async () => {
      const first = await add();
      await harness.db
        .update(products)
        .set({ categoryId: "dairy" })
        .where(
          eq(products.id, (await harness.db.select().from(products))[0]!.id),
        );

      const second = await add({ id: crypto.randomUUID() });

      expect(first.item.categoryId).toBeNull();
      expect(second.item.categoryId).toBe("dairy");
    });

    it("keeps the client's category when the client picked one", async () => {
      await add();
      await harness.db.update(products).set({ categoryId: "dairy" });

      const written = await add({ categoryId: "drinks" });

      expect(written.item.categoryId).toBe("drinks");
    });

    it("prefers the list's own override to the global default", async () => {
      await add();
      await harness.db.update(products).set({ categoryId: "dairy" });
      await harness.db.update(listProducts).set({ categoryId: "drinks" });

      expect((await add()).item.categoryId).toBe("drinks");
    });
  });

  describe("the usage counters", () => {
    it("counts the product once per add of the same name", async () => {
      await add();
      await add();

      const [usage] = await harness.db.select().from(listProducts);
      expect(usage?.useCount).toBe(2);
    });

    it("does not count the product again when the mutation is replayed", async () => {
      const input = addInput();
      await addItem(deps(), userId, input);
      await addItem(deps(), userId, input);

      const [usage] = await harness.db.select().from(listProducts);
      expect(usage?.useCount).toBe(1);
    });

    it("keeps the most recent quantity when an older queued add arrives", async () => {
      await add({ quantity: 3, contentUpdatedAt: iso() });
      await add({ quantity: 99, contentUpdatedAt: iso(-30 * MINUTE) });

      const [usage] = await harness.db.select().from(listProducts);
      expect(usage?.lastQuantity).toBe(3);
    });

    it("does not let an older queued add rewind when the product was last used", async () => {
      await add({ contentUpdatedAt: iso() });
      const before = (await harness.db.select().from(listProducts))[0]!
        .lastUsedAt;

      await add({ contentUpdatedAt: iso(-30 * MINUTE) });

      const after = (await harness.db.select().from(listProducts))[0]!
        .lastUsedAt;
      expect(after.getTime()).toBe(before.getTime());
    });

    it("records a rename against the product it was renamed to", async () => {
      const written = await add({ name: "latte" });
      await updateItem(deps(), userId, {
        ...mutation(),
        listId,
        id: written.item.id,
        contentUpdatedAt: iso(MINUTE),
        rawText: "pane",
        name: "pane",
        quantity: null,
        unit: null,
        unitText: null,
        note: null,
        categoryId: null,
      });

      const names = (await catalogForList(harness.db, listId)).map(
        (s) => s.name,
      );
      expect(names).toContain("pane");
    });
  });

  describe("what the list can see", () => {
    it("suggests the most used products of the list first", async () => {
      await add({ name: "pane" });
      await add({ name: "latte" });
      await add({ name: "latte" });

      const suggestions = await catalogForList(harness.db, listId);
      expect(suggestions.map((s) => s.name)).toEqual(["latte", "pane"]);
    });

    it("carries the unit the list last used, so a tap can restore it", async () => {
      await add({ name: "latte", quantity: 2, unit: "l" });

      const [suggestion] = await catalogForList(harness.db, listId);
      expect(suggestion).toMatchObject({ lastQuantity: 2, lastUnit: "l" });
    });

    it("hides the products of another list", async () => {
      await add({ name: "latte" });
      await addItem(
        deps(),
        userId,
        addInput({
          listId: otherListId,
          name: "segreto",
          id: crypto.randomUUID(),
        }),
      );

      const names = (await catalogForList(harness.db, listId)).map(
        (s) => s.name,
      );
      expect(names).toEqual(["latte"]);
    });

    it("shares one catalogue row between lists without sharing the usage", async () => {
      await add({ name: "latte" });
      await addItem(
        deps(),
        userId,
        addInput({
          listId: otherListId,
          name: "latte",
          id: crypto.randomUUID(),
        }),
      );

      expect(await harness.db.select().from(products)).toHaveLength(1);
      expect(await harness.db.select().from(listProducts)).toHaveLength(2);
    });
  });
});
