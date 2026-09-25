import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import {
  findListItem,
  getListClaim,
  removeById,
  removeListItem,
  setListClaim,
  upsertById,
  upsertListItem,
  withoutTombstones,
} from "@/lib/cache";
import { keys } from "@/lib/keys";
import { aListItem, aSession } from "./factories";

const LIST = "0199a0d0-0000-7000-8000-ffffffffffff";

describe("the pure array patches", () => {
  it("appends an id it has never seen", () => {
    const item = aListItem();

    expect(upsertById([], item)).toEqual([item]);
  });

  it("replaces in place rather than moving the row", () => {
    const first = aListItem({ name: "pane" });
    const second = aListItem({ name: "latte" });
    const renamed = { ...first, name: "pane integrale" };

    expect(upsertById([first, second], renamed)).toEqual([renamed, second]);
  });

  it("treats a cache that was never written as empty", () => {
    const item = aListItem();

    expect(upsertById(undefined, item)).toEqual([item]);
    expect(removeById(undefined, item.id)).toEqual([]);
  });

  it("does not mutate what it was given", () => {
    const items = [aListItem()];
    const before = [...items];

    upsertById(items, aListItem());
    removeById(items, items[0]!.id);

    expect(items).toEqual(before);
  });

  it("ignores a removal of something that is not there", () => {
    const items = [aListItem()];

    expect(removeById(items, "nope")).toEqual(items);
  });

  it("filters tombstones out", () => {
    const live = aListItem();
    const dead = aListItem({ deletedAt: new Date().toISOString() });

    expect(withoutTombstones([live, dead])).toEqual([live]);
  });
});

describe("writing an item into the cache", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
  });

  it("adds it to the list it belongs to", () => {
    const item = aListItem({ listId: LIST });

    upsertListItem(client, LIST, item);

    expect(client.getQueryData(keys.listItems(LIST))).toEqual([item]);
  });

  it("removes the row when what arrives is a tombstone", () => {
    const item = aListItem({ listId: LIST });
    upsertListItem(client, LIST, item);

    upsertListItem(client, LIST, {
      ...item,
      deletedAt: new Date().toISOString(),
    });

    expect(client.getQueryData(keys.listItems(LIST))).toEqual([]);
  });

  it("does not throw for a list nothing has been cached for yet", () => {
    expect(() => {
      removeListItem(client, "never-loaded", "whatever");
    }).not.toThrow();
  });

  it("leaves other lists alone", () => {
    const mine = aListItem({ listId: LIST });
    const theirs = aListItem({ listId: "other" });
    upsertListItem(client, LIST, mine);
    upsertListItem(client, "other", theirs);

    removeListItem(client, LIST, mine.id);

    expect(client.getQueryData(keys.listItems("other"))).toEqual([theirs]);
  });

  it("finds an item it wrote, and nothing it did not", () => {
    const item = aListItem({ listId: LIST });
    upsertListItem(client, LIST, item);

    expect(findListItem(client, LIST, item.id)).toEqual(item);
    expect(findListItem(client, LIST, "nope")).toBeUndefined();
  });
});

describe("the list claim", () => {
  it("round-trips a session and clears back to nobody", () => {
    const client = new QueryClient();
    const session = aSession({ listId: LIST });

    setListClaim(client, LIST, session);
    expect(getListClaim(client, LIST)).toEqual(session);

    setListClaim(client, LIST, null);
    expect(getListClaim(client, LIST)).toBeNull();
  });

  it("reports nobody for a list it has never heard about", () => {
    expect(getListClaim(new QueryClient(), "unknown")).toBeNull();
  });
});

describe("the key layout", () => {
  it("keeps the index from being a prefix of a single list", () => {
    // Invalidating the index after a rename must not drag every list's items
    // and catalogue down with it.
    expect(keys.list(LIST)[0]).not.toBe(keys.lists()[0]);
  });

  it("makes a single list a prefix of everything under it", () => {
    const list = keys.list(LIST) as readonly string[];

    for (const under of [
      keys.listItems(LIST),
      keys.catalog(LIST),
      keys.claim(LIST),
    ]) {
      expect((under as readonly string[]).slice(0, list.length)).toEqual(list);
    }
  });
});
