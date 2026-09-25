import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("idb-keyval", () => ({
  get: (key: string) => Promise.resolve(store.get(key)),
  set: (key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  },
  del: (key: string) => {
    store.delete(key);
    return Promise.resolve();
  },
}));

const { flushPersistedCache, persistOptions } =
  await import("@/lib/persist-query-client");
const { PERSIST_KEY } = await import("@/lib/pwa");
const { keys } = await import("@/lib/keys");
const { aListItem } = await import("./factories");

const read = (): PersistedClient =>
  JSON.parse(store.get(PERSIST_KEY) ?? "{}") as PersistedClient;

describe("flushPersistedCache", () => {
  beforeEach(() => {
    store.clear();
  });

  it("writes the cache as it is now, without waiting out the throttle", async () => {
    const client = new QueryClient();
    const item = aListItem();
    client.setQueryData(keys.listItems("L"), [item]);

    await flushPersistedCache(client);

    const queries = read().clientState.queries;
    expect(queries.find((q) => q.queryKey[0] === "list")?.state.data).toEqual([
      item,
    ]);
  });

  it("stamps the buster, so a shape change invalidates what it wrote", async () => {
    await flushPersistedCache(new QueryClient());

    expect(read().buster).toBe(persistOptions.buster);
  });

  it("replaces what was there instead of restoring it over the live cache", async () => {
    const stale = new QueryClient();
    stale.setQueryData(keys.listItems("L"), [aListItem({ name: "vecchio" })]);
    await flushPersistedCache(stale);

    const fresh = new QueryClient();
    fresh.setQueryData(keys.listItems("L"), [aListItem({ name: "nuovo" })]);
    await flushPersistedCache(fresh);

    const data = read().clientState.queries.find(
      (q) => q.queryKey[0] === "list",
    )?.state.data as Array<{ name: string }>;
    expect(data[0]?.name).toBe("nuovo");
  });
});
