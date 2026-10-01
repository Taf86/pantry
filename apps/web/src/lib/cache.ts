import type { QueryClient } from "@tanstack/react-query";
import type {
  ListDetail,
  ListItem,
  ListSummary,
  ShoppingSession,
} from "@pantry/shared";

import { keys } from "./keys";

/**
 * Cache patching, kept as pure array functions with two thin writers on top.
 *
 * The pure half is what the tests can reason about; the writers are what the
 * optimistic updates and the socket both go through, so a remote event and a
 * local guess can never disagree about what "the item changed" means.
 */

export const upsertById = <T extends { id: string }>(
  items: readonly T[] | undefined,
  next: T,
): T[] => {
  const current = items ?? [];
  const at = current.findIndex((item) => item.id === next.id);
  if (at === -1) return [...current, next];

  // Replaced in place: re-sorting is the reader's job, and moving a row under
  // the user's thumb while they are ticking things off is its own small bug.
  const copy = [...current];
  copy[at] = next;
  return copy;
};

export const removeById = <T extends { id: string }>(
  items: readonly T[] | undefined,
  id: string,
): T[] => (items ?? []).filter((item) => item.id !== id);

export const withoutTombstones = <T extends { deletedAt: string | null }>(
  items: readonly T[] | undefined,
): T[] => (items ?? []).filter((item) => item.deletedAt === null);

/**
 * Writes an item into the list's cache.
 *
 * A tombstone arriving here removes the row rather than storing it: the server
 * keeps tombstones so an offline client cannot resurrect a deleted row, but
 * nothing in the UI ever wants to render one.
 */
export const upsertListItem = (
  client: QueryClient,
  listId: string,
  item: ListItem,
): void => {
  client.setQueryData<ListItem[]>(keys.listItems(listId), (current) =>
    item.deletedAt === null
      ? upsertById(current, item)
      : removeById(current, item.id),
  );
};

export const removeListItem = (
  client: QueryClient,
  listId: string,
  itemId: string,
): void => {
  client.setQueryData<ListItem[]>(keys.listItems(listId), (current) =>
    removeById(current, itemId),
  );
};

export const findListItem = (
  client: QueryClient,
  listId: string,
  itemId: string,
): ListItem | undefined =>
  client
    .getQueryData<ListItem[]>(keys.listItems(listId))
    ?.find((item) => item.id === itemId);

/**
 * The service's order for the index: highest permissions first, then by id
 * (oldest first, since a UUID v7 leads with its mint time). Ids are compared
 * as plain strings, which matches Postgres' byte order on lowercase hex.
 */
export const compareListSummaries = (
  a: ListSummary,
  b: ListSummary,
): number => {
  if (a.permissions !== b.permissions) return b.permissions - a.permissions;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

/**
 * Writes a summary into the index.
 *
 * Sorted the way the server sorts it, so the refetch does not move the row:
 * a new list lands where its permissions and id put it, and a changed
 * permission moves the row to where the server would now return it.
 */
export const upsertListSummary = (
  client: QueryClient,
  summary: ListSummary,
): void => {
  client.setQueryData<ListSummary[]>(keys.lists(), (current) =>
    upsertById(current, summary).sort(compareListSummaries),
  );
};

export const removeListSummary = (
  client: QueryClient,
  listId: string,
): void => {
  client.setQueryData<ListSummary[]>(keys.lists(), (current) =>
    removeById(current, listId),
  );
};

export const findListSummary = (
  client: QueryClient,
  listId: string,
): ListSummary | undefined =>
  client
    .getQueryData<ListSummary[]>(keys.lists())
    ?.find((list) => list.id === listId);

/** Renames a list everywhere this client shows it: the index and the detail. */
export const renameList = (
  client: QueryClient,
  listId: string,
  name: string,
): void => {
  const previous = findListSummary(client, listId);
  if (previous) upsertListSummary(client, { ...previous, name });
  client.setQueryData<ListDetail>(
    keys.list(listId),
    (current) => current && { ...current, name },
  );
};

/** Who holds the list, as far as this client knows. `null` means nobody. */
export const setListClaim = (
  client: QueryClient,
  listId: string,
  session: ShoppingSession | null,
): void => {
  client.setQueryData<ShoppingSession | null>(keys.claim(listId), session);
};

export const getListClaim = (
  client: QueryClient,
  listId: string,
): ShoppingSession | null =>
  client.getQueryData<ShoppingSession | null>(keys.claim(listId)) ?? null;
