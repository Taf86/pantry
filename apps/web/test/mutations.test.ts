import { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { CONFLICT_CODE, type ListItem } from "pantry-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as TrpcModule from "../src/lib/trpc";

const mutate = {
  itemAdd: vi.fn(),
  itemUpdate: vi.fn(),
  itemCheck: vi.fn(),
  itemDelete: vi.fn(),
  nodeConsume: vi.fn(),
};

vi.mock("../src/lib/trpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TrpcModule>();
  return {
    ...actual,
    trpc: {
      items: {
        add: { mutate: mutate.itemAdd },
        update: { mutate: mutate.itemUpdate },
        check: { mutate: mutate.itemCheck },
        uncheck: { mutate: vi.fn() },
        delete: { mutate: mutate.itemDelete },
      },
      lists: {
        create: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
        share: { mutate: vi.fn() },
        unshare: { mutate: vi.fn() },
      },
      pantries: {
        create: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
        share: { mutate: vi.fn() },
        unshare: { mutate: vi.fn() },
        toList: { mutate: vi.fn() },
      },
      nodes: {
        create: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
        move: { mutate: vi.fn() },
        consume: { mutate: mutate.nodeConsume },
      },
      shopping: { toPantry: { mutate: vi.fn() } },
    },
  };
});

const { findListItem, findPantryNode } = await import("../src/lib/cache");
const { keys } = await import("../src/lib/keys");
const { MUTATION, registerMutationDefaults } =
  await import("../src/lib/mutations");
const { LIST_ID, PANTRY_ID, makeItem, makeNode } = await import("./factories");

const ITEM_ID = "01930d1e-0000-7000-8000-000000000001";
const MUTATION_ID = "01930d1e-0000-7000-8000-0000000000cc";

const conflictError = (current: ListItem): TRPCClientError<never> =>
  new TRPCClientError("Qualcuno ha modificato questo prodotto", {
    result: {
      error: {
        data: { code: "CONFLICT", conflict: { code: CONFLICT_CODE, current } },
      },
    },
  } as never);

describe("coda di mutazioni", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    registerMutationDefaults(client);
    client.setQueryData(keys.listItems(LIST_ID), [makeItem()]);
    client.setQueryData(keys.pantryNodes(PANTRY_ID), [makeNode()]);
  });

  const run = <T>(key: string, variables: T) =>
    client
      .getMutationCache()
      .build(client, { mutationKey: [key] })
      .execute(variables);

  it("registra una mutationFn per ogni chiave dichiarata", () => {
    for (const key of Object.values(MUTATION)) {
      const defaults = client.getMutationDefaults([key]);
      expect(defaults.mutationFn, `manca la mutationFn per ${key}`).toBeTypeOf(
        "function",
      );
    }
  });

  it("mostra subito l'aggiunta, prima ancora della risposta del server", async () => {
    let resolve: (value: ListItem) => void = () => {};
    mutate.itemAdd.mockReturnValueOnce(
      new Promise<ListItem>((r) => {
        resolve = r;
      }),
    );

    const pending = run(MUTATION.itemAdd, {
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: "01930d1e-0000-7000-8000-00000000000f",
      name: "Pane",
    });

    // L'ID esiste già nel client: nessuna riconciliazione al ritorno.
    expect(
      findListItem(client, LIST_ID, "01930d1e-0000-7000-8000-00000000000f")
        ?.name,
    ).toBe("Pane");

    resolve(
      makeItem({ id: "01930d1e-0000-7000-8000-00000000000f", name: "Pane" }),
    );
    await pending;

    expect(
      client.getQueryData<ListItem[]>(keys.listItems(LIST_ID)),
    ).toHaveLength(2);
  });

  it("toglie l'aggiunta ottimistica se il server la rifiuta", async () => {
    mutate.itemAdd.mockRejectedValueOnce(new Error("no"));

    await run(MUTATION.itemAdd, {
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: "01930d1e-0000-7000-8000-00000000000f",
      name: "Pane",
    }).catch(() => undefined);

    expect(
      client.getQueryData<ListItem[]>(keys.listItems(LIST_ID)),
    ).toHaveLength(1);
  });

  it("ripristina lo stato precedente quando la modifica fallisce", async () => {
    mutate.itemUpdate.mockRejectedValueOnce(new Error("rete assente"));

    await run(MUTATION.itemUpdate, {
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ITEM_ID,
      version: 1,
      name: "Nome nuovo",
    }).catch(() => undefined);

    expect(findListItem(client, LIST_ID, ITEM_ID)?.name).toBe("Latte");
  });

  it("su conflitto accetta lo stato del server invece di ripristinare il proprio", async () => {
    const serverVersion = makeItem({ name: "Vince il server", version: 7 });
    mutate.itemUpdate.mockRejectedValueOnce(conflictError(serverVersion));

    await run(MUTATION.itemUpdate, {
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ITEM_ID,
      version: 1,
      name: "Perde il client",
    }).catch(() => undefined);

    const current = findListItem(client, LIST_ID, ITEM_ID);
    expect(current?.name).toBe("Vince il server");
    expect(current?.version).toBe(7);
  });

  it("spunta subito, e la spunta sopravvive alla risposta del server", async () => {
    const checkedAt = "2026-08-11T18:03:00.000Z";
    mutate.itemCheck.mockResolvedValueOnce(makeItem({ checkedAt }));

    await run(MUTATION.itemCheck, {
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ITEM_ID,
      checkedAt,
    });

    expect(findListItem(client, LIST_ID, ITEM_ID)?.checkedAt).toBe(checkedAt);
  });

  it("rimette la spunta com'era se la richiesta fallisce", async () => {
    mutate.itemCheck.mockRejectedValueOnce(new Error("no"));

    await run(MUTATION.itemCheck, {
      mutationId: MUTATION_ID,
      listId: LIST_ID,
      id: ITEM_ID,
      checkedAt: "2026-08-11T18:03:00.000Z",
    }).catch(() => undefined);

    expect(findListItem(client, LIST_ID, ITEM_ID)?.checkedAt).toBeNull();
  });

  it("scala la giacenza in modo ottimistico senza scendere sotto zero", async () => {
    let resolve: (value: unknown) => void = () => {};
    mutate.nodeConsume.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const nodeId = makeNode().id;
    const pending = run(MUTATION.nodeConsume, {
      mutationId: MUTATION_ID,
      pantryId: PANTRY_ID,
      id: nodeId,
      delta: 10,
    });

    expect(findPantryNode(client, PANTRY_ID, nodeId)?.quantity).toBe(0);

    resolve(makeNode({ quantity: 0 }));
    await pending;
  });
});
