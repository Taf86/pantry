import { QueryClient } from "@tanstack/react-query";
import {
  serverEventSchema,
  type ListItem,
  type PantryNode,
} from "pantry-shared";
import { describe, expect, it } from "vitest";

import { applyServerEvent } from "../src/lib/socket";
import { keys } from "../src/lib/keys";
import {
  LIST_ID,
  PANTRY_ID,
  makeItem,
  makeNode,
  makeSession,
} from "./factories";

const clientWithData = (): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(keys.listItems(LIST_ID), [makeItem()]);
  client.setQueryData(keys.shoppingSession(), makeSession());
  client.setQueryData(keys.pantryNodes(PANTRY_ID), [makeNode()]);
  return client;
};

describe("applyServerEvent", () => {
  it("applica l'upsert di un item arrivato da un altro dispositivo", () => {
    const client = clientWithData();
    const item = makeItem({ name: "Latte scremato", version: 2 });

    applyServerEvent(client, { type: "item.upserted", listId: LIST_ID, item });

    expect(
      client.getQueryData<ListItem[]>(keys.listItems(LIST_ID))?.[0]?.name,
    ).toBe("Latte scremato");
  });

  it("rimuove l'item cancellato altrove", () => {
    const client = clientWithData();

    applyServerEvent(client, {
      type: "item.deleted",
      listId: LIST_ID,
      itemId: makeItem().id,
    });

    expect(client.getQueryData<ListItem[]>(keys.listItems(LIST_ID))).toEqual(
      [],
    );
  });

  it("aggiorna un nodo di dispensa", () => {
    const client = clientWithData();
    const node = makeNode({ quantity: 1 });

    applyServerEvent(client, {
      type: "pantry.node.upserted",
      pantryId: PANTRY_ID,
      node,
    });

    expect(
      client.getQueryData<PantryNode[]>(keys.pantryNodes(PANTRY_ID))?.[0]
        ?.quantity,
    ).toBe(1);
  });

  it("rimuove un nodo cancellato", () => {
    const client = clientWithData();

    applyServerEvent(client, {
      type: "pantry.node.deleted",
      pantryId: PANTRY_ID,
      nodeId: makeNode().id,
    });

    expect(
      client.getQueryData<PantryNode[]>(keys.pantryNodes(PANTRY_ID)),
    ).toEqual([]);
  });

  it("un evento malformato non arriva mai alla cache", () => {
    const client = clientWithData();
    const parsed = serverEventSchema.safeParse({
      type: "item.upserted",
      listId: LIST_ID,
      item: { id: "non-un-uuid" },
    });

    expect(parsed.success).toBe(false);
    expect(
      client.getQueryData<ListItem[]>(keys.listItems(LIST_ID)),
    ).toHaveLength(1);
  });
});
