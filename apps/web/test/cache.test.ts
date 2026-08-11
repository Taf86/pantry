import { QueryClient } from "@tanstack/react-query";
import type { ListItem, ShoppingSession } from "pantry-shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  findListItem,
  removeById,
  removeListItem,
  upsertById,
  upsertListItem,
  withoutTombstones,
} from "../src/lib/cache";
import { keys } from "../src/lib/keys";
import { LIST_ID, makeItem, makeSession } from "./factories";

describe("upsertById", () => {
  it("aggiunge in coda ciò che non c'è", () => {
    const result = upsertById([{ id: "a" }], { id: "b" });
    expect(result.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("sostituisce sul posto, senza spostare la riga", () => {
    const result = upsertById(
      [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
        { id: "c", n: 3 },
      ],
      { id: "b", n: 99 },
    );
    expect(result.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(result[1]?.n).toBe(99);
  });

  it("tratta l'assenza di dati come lista vuota", () => {
    expect(upsertById(undefined, { id: "a" })).toEqual([{ id: "a" }]);
  });

  it("non muta l'array originale", () => {
    const original = [{ id: "a" }];
    upsertById(original, { id: "a" });
    expect(original).toEqual([{ id: "a" }]);
  });
});

describe("removeById", () => {
  it("toglie solo la voce indicata", () => {
    expect(removeById([{ id: "a" }, { id: "b" }], "a")).toEqual([{ id: "b" }]);
  });

  it("è innocuo su un id assente", () => {
    expect(removeById([{ id: "a" }], "z")).toEqual([{ id: "a" }]);
  });
});

describe("withoutTombstones", () => {
  it("scarta le righe cancellate", () => {
    const items = [
      makeItem({ id: "a" }),
      makeItem({ id: "b", deletedAt: "x" }),
    ];
    expect(withoutTombstones(items).map((item) => item.id)).toEqual(["a"]);
  });
});

describe("upsertListItem", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
    client.setQueryData(keys.listItems(LIST_ID), [makeItem()]);
    client.setQueryData(keys.shoppingSession(), makeSession());
  });

  it("aggiorna sia la lista sia la sessione di spesa", () => {
    const updated = makeItem({ name: "Latte intero", version: 2 });
    upsertListItem(client, LIST_ID, updated);

    expect(findListItem(client, LIST_ID, updated.id)?.name).toBe(
      "Latte intero",
    );

    const session = client.getQueryData<ShoppingSession>(
      keys.shoppingSession(),
    );
    expect(session?.lists[0]?.items[0]?.name).toBe("Latte intero");
  });

  it("un tombstone toglie la riga da entrambe le cache", () => {
    upsertListItem(
      client,
      LIST_ID,
      makeItem({ deletedAt: "2026-08-11T11:00:00.000Z" }),
    );

    expect(client.getQueryData<ListItem[]>(keys.listItems(LIST_ID))).toEqual(
      [],
    );
    const session = client.getQueryData<ShoppingSession>(
      keys.shoppingSession(),
    );
    expect(session?.lists[0]?.items).toEqual([]);
  });

  it("non tocca le altre liste della sessione", () => {
    upsertListItem(client, LIST_ID, makeItem({ name: "Cambiato" }));
    const session = client.getQueryData<ShoppingSession>(
      keys.shoppingSession(),
    );
    expect(session?.lists[1]?.items).toEqual([]);
  });

  it("non esplode se la sessione non è in cache", () => {
    const empty = new QueryClient();
    expect(() => upsertListItem(empty, LIST_ID, makeItem())).not.toThrow();
  });
});

describe("removeListItem", () => {
  it("toglie la riga da lista e sessione", () => {
    const client = new QueryClient();
    client.setQueryData(keys.listItems(LIST_ID), [makeItem()]);
    client.setQueryData(keys.shoppingSession(), makeSession());

    removeListItem(client, LIST_ID, makeItem().id);

    expect(client.getQueryData<ListItem[]>(keys.listItems(LIST_ID))).toEqual(
      [],
    );
    expect(
      client.getQueryData<ShoppingSession>(keys.shoppingSession())?.lists[0]
        ?.items,
    ).toEqual([]);
  });
});
