import { TRPCError } from "@trpc/server";
import { uuidv7 } from "pantry-shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  consumeNode,
  createNode,
  deleteNode,
  getTree,
  moveNode,
} from "../../src/services/nodes.service.js";
import {
  expiringItems,
  missingItems,
} from "../../src/services/insights.service.js";
import {
  createHarness,
  integrationEnabled,
  makePantry,
  makeUser,
  type Harness,
} from "../helpers/harness.js";

describe.skipIf(!integrationEnabled)("dispensa", () => {
  let harness: Harness;
  let userId: string;
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
    pantryId = await makePantry(harness, userId);
  });

  const container = (name: string, parentId: string | null = null) =>
    createNode(harness.deps, userId, {
      mutationId: uuidv7(),
      pantryId,
      id: uuidv7(),
      parentId,
      kind: "container",
      name,
    });

  const item = (
    name: string,
    parentId: string | null,
    extra: { quantity?: number; minQuantity?: number; expiresAt?: string } = {},
  ) =>
    createNode(harness.deps, userId, {
      mutationId: uuidv7(),
      pantryId,
      id: uuidv7(),
      parentId,
      kind: "item",
      name,
      ...extra,
    });

  describe("invariante dell'albero", () => {
    it("rifiuta lo spostamento di un nodo dentro un proprio discendente", async () => {
      const armadio = await container("Armadio");
      const scaffale = await container("Scaffale", armadio.id);
      const cassetto = await container("Cassetto", scaffale.id);

      const move = moveNode(harness.deps, userId, {
        mutationId: uuidv7(),
        pantryId,
        id: armadio.id,
        parentId: cassetto.id,
      });

      await expect(move).rejects.toThrow(TRPCError);
    });

    it("rifiuta lo spostamento di un nodo dentro sé stesso", async () => {
      const armadio = await container("Armadio");
      await expect(
        moveNode(harness.deps, userId, {
          mutationId: uuidv7(),
          pantryId,
          id: armadio.id,
          parentId: armadio.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("consente lo spostamento verso un ramo indipendente", async () => {
      const armadio = await container("Armadio");
      const frigo = await container("Frigo");
      const scaffale = await container("Scaffale", armadio.id);

      const moved = await moveNode(harness.deps, userId, {
        mutationId: uuidv7(),
        pantryId,
        id: scaffale.id,
        parentId: frigo.id,
      });

      expect(moved.parentId).toBe(frigo.id);
    });

    it("non permette di annidare dentro un item", async () => {
      const biscotti = await item("Biscotti", null, { quantity: 1 });
      await expect(container("Assurdo", biscotti.id)).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe("cancellazione", () => {
    it("cancella anche il sottoalbero, senza lasciare figli irraggiungibili", async () => {
      const armadio = await container("Armadio");
      const scaffale = await container("Scaffale", armadio.id);
      await item("Pasta", scaffale.id, { quantity: 2 });

      const { ids } = await deleteNode(harness.deps, userId, {
        mutationId: uuidv7(),
        pantryId,
        id: armadio.id,
      });

      expect(ids).toHaveLength(3);
      expect(await getTree(harness.deps, pantryId)).toHaveLength(0);
    });
  });

  describe("consumo", () => {
    it("sottrae con un UPDATE relativo, non con read-modify-write", async () => {
      const pasta = await item("Pasta", null, { quantity: 5 });

      await Promise.all(
        Array.from({ length: 5 }, () =>
          consumeNode(harness.deps, userId, {
            mutationId: uuidv7(),
            pantryId,
            id: pasta.id,
            delta: 1,
          }),
        ),
      );

      const [current] = await getTree(harness.deps, pantryId);
      expect(current?.quantity).toBe(0);
    });

    it("non scende sotto zero", async () => {
      const pasta = await item("Pasta", null, { quantity: 1 });
      const consumed = await consumeNode(harness.deps, userId, {
        mutationId: uuidv7(),
        pantryId,
        id: pasta.id,
        delta: 10,
      });
      expect(consumed.quantity).toBe(0);
    });

    it("non riapplica un consumo ritentato dalla coda offline", async () => {
      const pasta = await item("Pasta", null, { quantity: 5 });
      const input = {
        mutationId: uuidv7(),
        pantryId,
        id: pasta.id,
        delta: 2,
      };

      await consumeNode(harness.deps, userId, input);
      const replayed = await consumeNode(harness.deps, userId, input);

      expect(replayed.quantity).toBe(3);
    });
  });

  describe("avvisi", () => {
    it("segnala solo gli item con una soglia superata", async () => {
      await item("Sale", null, { quantity: 0, minQuantity: 1 });
      await item("Zucchero", null, { quantity: 5, minQuantity: 1 });
      await item("Pepe", null, { quantity: 0 });

      const missing = await missingItems(harness.deps, pantryId);
      expect(missing.map((alert) => alert.node.name)).toEqual(["Sale"]);
    });

    it("allega il percorso leggibile del contenitore", async () => {
      const cucina = await container("Cucina");
      const scaffale = await container("Scaffale 1", cucina.id);
      await item("Sale", scaffale.id, { quantity: 0, minQuantity: 1 });

      const [alert] = await missingItems(harness.deps, pantryId);
      expect(alert?.path).toEqual(["Cucina", "Scaffale 1"]);
    });

    it("elenca gli item in scadenza entro la finestra, gli scaduti compresi", async () => {
      const yesterday = new Date(Date.now() - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const soon = new Date(Date.now() + 3 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const later = new Date(Date.now() + 60 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      await item("Scaduto", null, { expiresAt: yesterday });
      await item("In scadenza", null, { expiresAt: soon });
      await item("Buono", null, { expiresAt: later });

      const expiring = await expiringItems(harness.deps, pantryId, 7);
      expect(expiring.map((alert) => alert.node.name)).toEqual([
        "Scaduto",
        "In scadenza",
      ]);
    });
  });
});
