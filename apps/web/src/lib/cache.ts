import type { QueryClient } from "@tanstack/react-query";
import type { ListSummary } from "@pantry/shared";

import { keys } from "./keys";

const upsertById = <T extends { id: string }>(
  items: readonly T[] | undefined,
  next: T,
): T[] => {
  const current = items ?? [];
  const at = current.findIndex((item) => item.id === next.id);
  if (at === -1) return [...current, next];

  const copy = [...current];
  copy[at] = next;
  return copy;
};

const removeById = <T extends { id: string }>(
  items: readonly T[] | undefined,
  id: string,
): T[] => (items ?? []).filter((item) => item.id !== id);

const compareListSummaries = (a: ListSummary, b: ListSummary): number => {
  if (a.permissions !== b.permissions) return b.permissions - a.permissions;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

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

export const renameList = (
  client: QueryClient,
  listId: string,
  name: string,
): void => {
  const previous = findListSummary(client, listId);
  if (previous) upsertListSummary(client, { ...previous, name });
  // client.setQueryData<ListDetail>(
  //   keys.list(listId),
  //   (current) => current && { ...current, name },
  // );
};
