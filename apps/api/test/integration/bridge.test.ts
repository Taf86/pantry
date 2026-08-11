import { uuidv7 } from "pantry-shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  pantryToList,
  shoppingToPantry,
} from "../../src/services/bridge.service.js";
import {
  addItem,
  checkItem,
  listItemsOfList,
} from "../../src/services/items.service.js";
import { createNode, getTree } from "../../src/services/nodes.service.js";
import {
  createHarness,
  integrationEnabled,
  makeList,
  makePantry,
  makeUser,
  type Harness,
} from "../helpers/harness.js";

describe.skipIf(!integrationEnabled)("il ponte lista ↔ dispensa", () => {
  let harness: Harness;
  let userId: string;
  let listId: string;
  let pantryId: string;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    userId = await makeUser(harness);
    listId = await makeList(harness, userId);
    pantryId = await makePantry(harness, userId);
  });

  const pantryItem = (
    name: string,
    extra: { quantity?: number; minQuantity?: number } = {},
  ) =>
    createNode(harness.deps, userId, {
      mutationId: uuidv7(),
      pantryId,
      id: uuidv7(),
      parentId: null,
      kind: "item",
      name,
      ...extra,
    });

  const listItem = async (name: string, quantity?: number) => {
    const item = await addItem(harness.deps, userId, {
      mutationId: uuidv7(),
      listId,
      id: uuidv7(),
      name,
      ...(quantity === undefined ? {} : { quantity }),
    });
    return item;
  };

  describe("pantry.toList", () => {
    it("crea item di lista con la quantità che manca alla soglia", async () => {
      const sale = await pantryItem("Sale", { quantity: 1, minQuantity: 4 });

      const result = await pantryToList(harness.deps, userId, {
        mutationId: uuidv7(),
        pantryId,
        listId,
        entries: [{ nodeId: sale.id, itemId: uuidv7() }],
      });

      expect(result.created).toHaveLength(1);
      expect(result.created[0]?.name).toBe("Sale");
      expect(result.created[0]?.quantity).toBe(3);
    });

    it("non aggiunge un prodotto già presente e non spuntato", async () => {
      await listItem("Sale");
      const sale = await pantryItem("Sale", { quantity: 0, minQuantity: 2 });

      const result = await pantryToList(harness.deps, userId, {
        mutationId: uuidv7(),
        pantryId,
        listId,
        entries: [{ nodeId: sale.id, itemId: uuidv7() }],
      });

      expect(result.created).toHaveLength(0);
      expect(result.skipped).toEqual([sale.id]);
    });

    it("è idempotente su ritentativo", async () => {
      const sale = await pantryItem("Sale", { quantity: 0, minQuantity: 2 });
      const input = {
        mutationId: uuidv7(),
        pantryId,
        listId,
        entries: [{ nodeId: sale.id, itemId: uuidv7() }],
      };

      await pantryToList(harness.deps, userId, input);
      await pantryToList(harness.deps, userId, input);

      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        1,
      );
    });
  });

  describe("shopping.toPantry", () => {
    const buy = async (name: string, quantity?: number) => {
      const item = await listItem(name, quantity);
      await checkItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        checkedAt: new Date().toISOString(),
      });
      return item;
    };

    it("crea in dispensa i prodotti comprati e li toglie dalla lista", async () => {
      const latte = await buy("Latte", 2);

      const result = await shoppingToPantry(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        pantryId,
        parentId: null,
        entries: [{ itemId: latte.id, nodeId: uuidv7() }],
        clearFromList: true,
      });

      expect(result.nodes[0]?.name).toBe("Latte");
      expect(result.nodes[0]?.quantity).toBe(2);
      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        0,
      );
    });

    it("incrementa l'omonimo già presente invece di duplicarlo", async () => {
      await pantryItem("Latte", { quantity: 1 });
      const latte = await buy("Latte", 2);

      const result = await shoppingToPantry(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        pantryId,
        parentId: null,
        entries: [{ itemId: latte.id, nodeId: uuidv7() }],
        clearFromList: true,
      });

      expect(result.nodes[0]?.quantity).toBe(3);
      expect(await getTree(harness.deps, pantryId)).toHaveLength(1);
    });

    it("salta ciò che non è stato spuntato: in dispensa va solo il comprato", async () => {
      const nonComprato = await listItem("Pane");

      const result = await shoppingToPantry(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        pantryId,
        parentId: null,
        entries: [{ itemId: nonComprato.id, nodeId: uuidv7() }],
        clearFromList: true,
      });

      expect(result.nodes).toHaveLength(0);
      expect(result.skipped).toEqual([nonComprato.id]);
      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        1,
      );
    });

    it("può lasciare la lista intatta se richiesto", async () => {
      const latte = await buy("Latte", 1);

      await shoppingToPantry(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        pantryId,
        parentId: null,
        entries: [{ itemId: latte.id, nodeId: uuidv7() }],
        clearFromList: false,
      });

      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        1,
      );
    });

    it("non raddoppia le giacenze su ritentativo", async () => {
      const latte = await buy("Latte", 2);
      const input = {
        mutationId: uuidv7(),
        listId,
        pantryId,
        parentId: null,
        entries: [{ itemId: latte.id, nodeId: uuidv7() }],
        clearFromList: true,
      };

      await shoppingToPantry(harness.deps, userId, input);
      const replayed = await shoppingToPantry(harness.deps, userId, input);

      expect(replayed.nodes[0]?.quantity).toBe(2);
    });
  });
});
