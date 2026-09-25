import { QueryClient, onlineManager } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type * as TrpcModule from "@/lib/trpc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ path: string; input: unknown }> = [];
let failNext: Error | null = null;

const record =
  (path: string) =>
  (input: unknown): Promise<unknown> => {
    calls.push({ path, input });
    if (failNext) {
      const error = failNext;
      failNext = null;
      return Promise.reject(error);
    }
    return Promise.resolve(replies[path]?.(input) ?? { ok: true });
  };

const replies: Record<string, (input: unknown) => unknown> = {};

vi.mock("@/lib/trpc", async () => {
  const actual = await vi.importActual<typeof TrpcModule>("@/lib/trpc");
  return {
    ...actual,
    trpc: {
      lists: {
        create: { mutate: record("lists.create") },
        update: { mutate: record("lists.update") },
        delete: { mutate: record("lists.delete") },
        members: {
          set: { mutate: record("lists.members.set") },
          remove: { mutate: record("lists.members.remove") },
          leave: { mutate: record("lists.members.leave") },
        },
      },
      items: {
        add: { mutate: record("items.add") },
        update: { mutate: record("items.update") },
        check: { mutate: record("items.check") },
        uncheck: { mutate: record("items.uncheck") },
        delete: { mutate: record("items.delete") },
      },
      shopping: {
        claim: { mutate: record("shopping.claim") },
        release: { mutate: record("shopping.release") },
        heartbeat: { mutate: record("shopping.heartbeat") },
      },
    },
  };
});

const {
  MUTATION,
  QUEUEABLE,
  isQueueable,
  listScope,
  registerMutationDefaults,
} = await import("@/lib/mutations");
const { persistOptions } = await import("@/lib/persist-query-client");
const { keys } = await import("@/lib/keys");
const { aListItem } = await import("./factories");

/**
 * A refusal, not a blip.
 *
 * `isRetriable` deliberately retries anything without a code, because that is
 * what a dropped connection looks like. A FORBIDDEN never changes its mind,
 * and a queue that retried it would never drain.
 */
const refusal = (code = "FORBIDDEN"): TRPCClientError<never> => {
  const error = new TRPCClientError<never>("refused");
  Object.defineProperty(error, "data", { value: { code } });
  return error;
};

const LIST = "0199a0d0-0000-7000-8000-ffffffffffff";
const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();

const addInput = (overrides: Record<string, unknown> = {}) => ({
  mutationId: crypto.randomUUID(),
  listId: LIST,
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

const written = (item: unknown, serverTime = iso()) => ({
  outcome: "applied",
  item,
  serverTime,
});

describe("the offline mutation layer", () => {
  let client: QueryClient;

  beforeEach(() => {
    calls.length = 0;
    failNext = null;
    for (const key of Object.keys(replies)) delete replies[key];
    onlineManager.setOnline(true);
    client = new QueryClient();
    registerMutationDefaults(client);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    client.clear();
  });

  it("registers a mutationFn for every declared key", () => {
    for (const key of Object.values(MUTATION)) {
      const defaults = client.getMutationDefaults([key]);
      expect(defaults.mutationFn, `no mutationFn for ${key}`).toBeTypeOf(
        "function",
      );
    }
  });

  it("keeps the queueable set inside the declared keys", () => {
    const declared = new Set<string>(Object.values(MUTATION));

    for (const key of QUEUEABLE) expect(declared.has(key)).toBe(true);
  });

  describe("online-only mutations", () => {
    const onlineOnlyKeys = [
      MUTATION.shoppingClaim,
      MUTATION.shoppingRelease,
      MUTATION.shoppingHeartbeat,
      MUTATION.listMemberSet,
      MUTATION.listMemberRemove,
      MUTATION.listLeave,
    ];

    it("never declares one of them queueable", () => {
      for (const key of onlineOnlyKeys) expect(isQueueable([key])).toBe(false);
    });

    it("fails a claim immediately when offline, instead of pausing it", async () => {
      onlineManager.setOnline(false);
      const mutation = client.getMutationCache().build(client, {
        ...client.getMutationDefaults([MUTATION.shoppingClaim]),
        mutationKey: [MUTATION.shoppingClaim],
      });

      await expect(mutation.execute({ listId: LIST })).rejects.toThrow(
        /offline/i,
      );

      // The load-bearing assertion. Under networkMode "online" TanStack would
      // have PAUSED this, persisted it, and replayed it on reconnection.
      expect(mutation.state.isPaused).toBe(false);
      expect(calls).toEqual([]);
    });

    it("pauses a tick when offline, because that one must survive", async () => {
      onlineManager.setOnline(false);
      const mutation = client.getMutationCache().build(client, {
        ...client.getMutationDefaults([MUTATION.itemCheck]),
        mutationKey: [MUTATION.itemCheck],
      });

      void mutation.execute({
        mutationId: crypto.randomUUID(),
        listId: LIST,
        id: "x",
        checkedAt: iso(),
      });
      await vi.waitFor(() => {
        expect(mutation.state.isPaused).toBe(true);
      });
    });

    it("keeps a paused online-only mutation out of storage", () => {
      const paused = (key: string) => ({
        mutationKey: [key],
        state: { isPaused: true },
        options: { mutationKey: [key] },
      });
      const keep = persistOptions.dehydrateOptions?.shouldDehydrateMutation;

      expect(keep).toBeTypeOf("function");
      for (const key of onlineOnlyKeys) {
        expect(keep?.(paused(key) as never)).toBe(false);
      }
      expect(keep?.(paused(MUTATION.itemCheck) as never)).toBe(true);
    });
  });

  const run = (key: string, input: unknown) => {
    const mutation = client.getMutationCache().build(client, {
      ...client.getMutationDefaults([key]),
      mutationKey: [key],
    });
    return { mutation, done: mutation.execute(input) };
  };

  describe("optimistic updates", () => {
    it("shows an added item before the server has answered", async () => {
      const input = addInput();
      let release!: (value: unknown) => void;
      replies["items.add"] = () =>
        new Promise((resolve) => (release = resolve));

      const { done } = run(MUTATION.itemAdd, input);
      await vi.waitFor(() => {
        expect(client.getQueryData(keys.listItems(LIST))).toHaveLength(1);
      });

      release(written({ ...aListItem(), id: input.id, listId: LIST }));
      await done;
    });

    it("takes the added item back when the server refuses it", async () => {
      const input = addInput();
      failNext = refusal();

      await expect(run(MUTATION.itemAdd, input).done).rejects.toThrow();
      expect(client.getQueryData(keys.listItems(LIST))).toEqual([]);
    });

    it("adopts the row the server sends back, verbatim", async () => {
      const input = addInput();
      const canonical = {
        ...aListItem(),
        id: input.id,
        listId: LIST,
        name: "patate novelle",
      };
      replies["items.add"] = () => written(canonical);

      await run(MUTATION.itemAdd, input).done;

      expect(client.getQueryData(keys.listItems(LIST))).toEqual([canonical]);
    });

    it("restores the previous row when an edit fails", async () => {
      const original = aListItem({ listId: LIST, name: "pane" });
      client.setQueryData(keys.listItems(LIST), [original]);
      failNext = refusal();

      await expect(
        run(MUTATION.itemUpdate, {
          mutationId: crypto.randomUUID(),
          listId: LIST,
          id: original.id,
          contentUpdatedAt: iso(1000),
          rawText: "pane integrale",
          name: "pane integrale",
          quantity: null,
          unit: null,
          unitText: null,
          note: null,
          categoryId: null,
        }).done,
      ).rejects.toThrow();

      expect(client.getQueryData(keys.listItems(LIST))).toEqual([original]);
    });

    it("leaves the content clock alone when ticking", async () => {
      const original = aListItem({ listId: LIST });
      client.setQueryData(keys.listItems(LIST), [original]);
      const checkedAt = iso(1000);
      let release!: (value: unknown) => void;
      replies["items.check"] = () =>
        new Promise((resolve) => (release = resolve));

      const { done } = run(MUTATION.itemCheck, {
        mutationId: crypto.randomUUID(),
        listId: LIST,
        id: original.id,
        checkedAt,
      });

      await vi.waitFor(() => {
        const [row] = client.getQueryData<(typeof original)[]>(
          keys.listItems(LIST),
        )!;
        expect(row?.checkedAt).toBe(checkedAt);
        // The whole reason there are two clocks.
        expect(row?.contentUpdatedAt).toBe(original.contentUpdatedAt);
        expect(row?.checkUpdatedAt).toBe(checkedAt);
      });

      release(written({ ...original, checkedAt, checkUpdatedAt: checkedAt }));
      await done;
    });

    it("removes a deleted row at once and puts it back if the delete fails", async () => {
      const original = aListItem({ listId: LIST });
      client.setQueryData(keys.listItems(LIST), [original]);
      failNext = refusal();

      await expect(
        run(MUTATION.itemDelete, {
          mutationId: crypto.randomUUID(),
          listId: LIST,
          id: original.id,
          at: iso(),
        }).done,
      ).rejects.toThrow();

      expect(client.getQueryData(keys.listItems(LIST))).toEqual([original]);
    });
  });
});

describe("what the queue retries", () => {
  it("retries something that looks like a dropped connection", async () => {
    const { isRetriable } = await import("@/lib/trpc");

    expect(isRetriable(new Error("socket hang up"))).toBe(true);
  });

  it("refuses to retry a refusal, or the queue would never drain", async () => {
    const { isRetriable } = await import("@/lib/trpc");
    const forbidden = new TRPCClientError<never>("refused");
    Object.defineProperty(forbidden, "data", { value: { code: "FORBIDDEN" } });

    expect(isRetriable(forbidden)).toBe(false);
  });
});

describe("draining in order", () => {
  it("survives a restart carrying its scope, which is what keeps the order", async () => {
    const { dehydrate } = await import("@tanstack/react-query");
    const client = new QueryClient();
    registerMutationDefaults(client);
    onlineManager.setOnline(false);

    const mutation = client.getMutationCache().build(client, {
      ...client.getMutationDefaults([MUTATION.itemCheck]),
      mutationKey: [MUTATION.itemCheck],
      scope: { id: listScope(LIST) },
    });
    void mutation.execute({
      mutationId: crypto.randomUUID(),
      listId: LIST,
      id: "x",
      checkedAt: iso(),
    });
    await vi.waitFor(() => {
      expect(mutation.state.isPaused).toBe(true);
    });

    const frozen = dehydrate(client, persistOptions.dehydrateOptions);

    // Without the scope surviving, every queued write resumes in parallel and
    // an add can land after the tick that depends on it.
    expect(frozen.mutations).toHaveLength(1);
    expect(frozen.mutations[0]?.scope).toEqual({ id: listScope(LIST) });
    expect(frozen.mutations[0]?.mutationKey).toEqual([MUTATION.itemCheck]);

    onlineManager.setOnline(true);
    client.clear();
  });

  it("gives two lists two different scopes", () => {
    expect(listScope("a")).not.toBe(listScope("b"));
  });
});

describe("pendingDeletedIds", () => {
  it("names the rows whose delete has not landed yet", async () => {
    const { pendingDeletedIds } = await import("@/lib/pending");
    const client = new QueryClient();
    registerMutationDefaults(client);
    onlineManager.setOnline(false);

    const doomed = crypto.randomUUID();
    const mutation = client.getMutationCache().build(client, {
      ...client.getMutationDefaults([MUTATION.itemDelete]),
      mutationKey: [MUTATION.itemDelete],
    });
    void mutation.execute({
      mutationId: crypto.randomUUID(),
      listId: LIST,
      id: doomed,
      at: iso(),
    });
    await vi.waitFor(() => {
      expect(mutation.state.isPaused).toBe(true);
    });

    // A socket event for this id must be ignored, or the row you deleted comes
    // back the moment another device touches it.
    expect(pendingDeletedIds(client).has(doomed)).toBe(true);
    expect(pendingDeletedIds(client).has("something else")).toBe(false);

    onlineManager.setOnline(true);
    client.clear();
  });

  it("is empty when nothing is in flight", async () => {
    const { pendingDeletedIds } = await import("@/lib/pending");

    expect(pendingDeletedIds(new QueryClient()).size).toBe(0);
  });
});
