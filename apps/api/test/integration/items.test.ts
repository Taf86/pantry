import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { CONFLICT_CODE, uuidv7 } from "pantry-shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listItems } from "../../src/db/schema/lists.js";
import {
  addItem,
  checkItem,
  deleteItem,
  listItemsOfList,
  uncheckItem,
  updateItem,
} from "../../src/services/items.service.js";
import {
  createHarness,
  integrationEnabled,
  makeList,
  makeUser,
  type Harness,
} from "../helpers/harness.js";

describe.skipIf(!integrationEnabled)("items", () => {
  let harness: Harness;
  let userId: string;
  let listId: string;

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
  });

  const add = (overrides: Partial<{ id: string; name: string }> = {}) =>
    addItem(harness.deps, userId, {
      mutationId: uuidv7(),
      listId,
      id: overrides.id ?? uuidv7(),
      name: overrides.name ?? "Latte",
    });

  describe("idempotenza", () => {
    it("non duplica quando la coda offline ritenta la stessa mutazione", async () => {
      const input = {
        mutationId: uuidv7(),
        listId,
        id: uuidv7(),
        name: "Latte",
      };

      const first = await addItem(harness.deps, userId, input);
      const second = await addItem(harness.deps, userId, input);

      expect(second.id).toBe(first.id);
      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        1,
      );
    });

    it("tratta due aggiunte concorrenti come due prodotti distinti", async () => {
      await add({ name: "Latte" });
      await add({ name: "Latte" });
      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        2,
      );
    });

    it("non riapplica una modifica ritentata dopo un'altra scrittura", async () => {
      const item = await add();
      const input = {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        version: item.version,
        name: "Latte intero",
      };

      const updated = await updateItem(harness.deps, userId, input);
      const replayed = await updateItem(harness.deps, userId, input);

      expect(updated.version).toBe(item.version + 1);
      expect(replayed.version).toBe(updated.version);
      expect(replayed.name).toBe("Latte intero");
    });
  });

  describe("locking ottimistico", () => {
    it("respinge la modifica basata su una versione superata", async () => {
      const item = await add();
      await updateItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        version: item.version,
        name: "Primo",
      });

      const stale = updateItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        version: item.version,
        name: "Secondo",
      });

      await expect(stale).rejects.toThrow(TRPCError);
    });

    it("allega al conflitto lo stato corrente, così il client può accettarlo", async () => {
      const item = await add();
      await updateItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        version: item.version,
        name: "Vincente",
      });

      const error = await updateItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        version: item.version,
        name: "Perdente",
      }).catch((caught: unknown) => caught as TRPCError);

      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("CONFLICT");
      const cause = (error as TRPCError).cause as unknown as {
        code: string;
        current: { name: string } | null;
      };
      expect(cause.code).toBe(CONFLICT_CODE);
      expect(cause.current?.name).toBe("Vincente");
    });
  });

  describe("last-write-wins sulla spunta", () => {
    it("applica la spunta e registra chi l'ha fatta", async () => {
      const item = await add();
      const checkedAt = new Date().toISOString();

      const checked = await checkItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        checkedAt,
      });

      expect(checked.checkedAt).not.toBeNull();
      expect(checked.checkedBy).toBe(userId);
    });

    it("non lascia che una spunta vecchia sovrascriva una de-spunta più recente", async () => {
      const item = await add();
      const early = new Date("2026-08-11T18:03:00.000Z").toISOString();
      const late = new Date("2026-08-11T18:20:00.000Z").toISOString();

      await checkItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        checkedAt: late,
      });
      await uncheckItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        at: late,
      });

      const result = await checkItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        checkedAt: early,
      });

      expect(result.checkedAt).toBeNull();
    });

    it("non tocca la versione: chi spunta non invalida chi modifica", async () => {
      const item = await add();
      const checked = await checkItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        checkedAt: new Date().toISOString(),
      });

      expect(checked.version).toBe(item.version);

      const updated = await updateItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
        version: item.version,
        name: "Ancora modificabile",
      });
      expect(updated.name).toBe("Ancora modificabile");
    });
  });

  describe("tombstone", () => {
    it("non cancella fisicamente la riga", async () => {
      const item = await add();
      await deleteItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
      });

      const rows = await harness.db
        .select()
        .from(listItems)
        .where(eq(listItems.id, item.id));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.deletedAt).not.toBeNull();
    });

    it("nasconde il tombstone salvo richiesta esplicita", async () => {
      const item = await add();
      await deleteItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
      });

      expect(await listItemsOfList(harness.deps, listId, false)).toHaveLength(
        0,
      );
      expect(await listItemsOfList(harness.deps, listId, true)).toHaveLength(1);
    });
  });

  describe("eventi", () => {
    it("notifica ogni scrittura sulla room della lista", async () => {
      const item = await add();
      harness.deps.events.events.length = 0;

      await deleteItem(harness.deps, userId, {
        mutationId: uuidv7(),
        listId,
        id: item.id,
      });

      expect(harness.deps.events.events).toEqual([
        { type: "item.deleted", listId, itemId: item.id },
      ]);
    });
  });
});
