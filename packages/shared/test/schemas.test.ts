import { describe, expect, it } from "vitest";

import { MAX_CHECK_BATCH } from "../src/constants.js";
import { serverEventSchema } from "../src/events.js";
import { Permission, Role } from "../src/permissions.js";
import { permissionsSchema } from "../src/schemas/common.js";
import {
  addItemInput,
  checkManyInput,
  updateItemInput,
} from "../src/schemas/item.js";
import { consumeNodeInput, moveNodeInput } from "../src/schemas/pantry.js";
import { createUserInput } from "../src/schemas/user.js";
import { makeItem } from "./factories.js";

const ID = "01930d1e-0000-7000-8000-000000000001";
const LIST_ID = "01930d1e-0000-7000-8000-0000000000ff";
const MUTATION_ID = "01930d1e-0000-7000-8000-0000000000aa";

describe("createUserInput", () => {
  it("normalizza l'email prima di validarla", () => {
    const parsed = createUserInput.parse({
      email: "  Mario.Rossi@Esempio.IT ",
      displayName: "  Mario Rossi  ",
    });
    expect(parsed.email).toBe("mario.rossi@esempio.it");
    expect(parsed.displayName).toBe("Mario Rossi");
    expect(parsed.role).toBe("user");
  });

  it("rifiuta un indirizzo non valido", () => {
    expect(
      createUserInput.safeParse({ email: "mario", displayName: "M" }).success,
    ).toBe(false);
  });
});

describe("permissionsSchema", () => {
  it("accetta le maschere dei ruoli noti", () => {
    for (const mask of Object.values(Role)) {
      expect(permissionsSchema.parse(mask)).toBe(mask);
    }
  });

  it("rifiuta i bit non definiti", () => {
    expect(permissionsSchema.safeParse(1 << 6).success).toBe(false);
  });

  it("rifiuta i valori negativi", () => {
    expect(permissionsSchema.safeParse(-Permission.Read).success).toBe(false);
  });
});

describe("addItemInput", () => {
  it("richiede sempre un mutationId", () => {
    const result = addItemInput.safeParse({
      listId: LIST_ID,
      id: ID,
      name: "Latte",
    });
    expect(result.success).toBe(false);
  });

  it("ripulisce gli spazi dal nome", () => {
    const parsed = addItemInput.parse({
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ID,
      name: "  Latte intero  ",
    });
    expect(parsed.name).toBe("Latte intero");
  });

  it("rifiuta un nome vuoto", () => {
    const result = addItemInput.safeParse({
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ID,
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta una quantità negativa", () => {
    const result = addItemInput.safeParse({
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ID,
      name: "Latte",
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateItemInput", () => {
  it("esige la version attesa: è il perno del locking ottimistico", () => {
    const result = updateItemInput.safeParse({
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ID,
      name: "Latte",
    });
    expect(result.success).toBe(false);
  });
});

describe("checkManyInput", () => {
  it("limita la dimensione del batch", () => {
    const checks = Array.from({ length: MAX_CHECK_BATCH + 1 }, () => ({
      listId: LIST_ID,
      id: ID,
      checkedAt: null,
    }));
    expect(
      checkManyInput.safeParse({ mutationId: MUTATION_ID, checks }).success,
    ).toBe(false);
  });

  it("rifiuta un batch vuoto", () => {
    expect(
      checkManyInput.safeParse({ mutationId: MUTATION_ID, checks: [] }).success,
    ).toBe(false);
  });
});

describe("moveNodeInput", () => {
  it("accetta null come destinazione, cioè la radice", () => {
    const parsed = moveNodeInput.parse({
      mutationId: MUTATION_ID,
      pantryId: LIST_ID,
      id: ID,
      parentId: null,
    });
    expect(parsed.parentId).toBeNull();
  });

  it("non accetta un parentId assente: la radice va detta esplicitamente", () => {
    const result = moveNodeInput.safeParse({
      mutationId: MUTATION_ID,
      pantryId: LIST_ID,
      id: ID,
    });
    expect(result.success).toBe(false);
  });
});

describe("consumeNodeInput", () => {
  it("rifiuta un consumo nullo o negativo", () => {
    const base = { mutationId: MUTATION_ID, pantryId: LIST_ID, id: ID };
    expect(consumeNodeInput.safeParse({ ...base, delta: 0 }).success).toBe(
      false,
    );
    expect(consumeNodeInput.safeParse({ ...base, delta: -2 }).success).toBe(
      false,
    );
    expect(consumeNodeInput.safeParse({ ...base, delta: 1.5 }).success).toBe(
      true,
    );
  });
});

describe("serverEventSchema", () => {
  it("valida un evento di upsert", () => {
    const event = serverEventSchema.parse({
      type: "item.upserted",
      listId: LIST_ID,
      item: makeItem({ id: ID, listId: LIST_ID }),
    });
    expect(event.type).toBe("item.upserted");
  });

  it("rifiuta un tipo sconosciuto", () => {
    expect(
      serverEventSchema.safeParse({ type: "item.exploded", listId: LIST_ID })
        .success,
    ).toBe(false);
  });
});
