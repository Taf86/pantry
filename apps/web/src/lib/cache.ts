import type { QueryClient } from "@tanstack/react-query";
import type { ListItem, PantryNode, ShoppingSession } from "pantry-shared";

import { keys } from "./keys";

/**
 * Manipolazioni di cache pure e riusabili.
 *
 * Sono funzioni su array, non su `QueryClient`: così l'aggiornamento
 * ottimistico, la riconciliazione con la risposta del server e l'applicazione
 * di un evento real-time condividono la stessa identica regola, e quella
 * regola si può testare senza montare niente.
 */

export const upsertById = <T extends { id: string }>(
  items: readonly T[] | undefined,
  next: T,
): T[] => {
  const list = items ?? [];
  const index = list.findIndex((entry) => entry.id === next.id);
  if (index === -1) return [...list, next];
  return list.map((entry, position) => (position === index ? next : entry));
};

export const removeById = <T extends { id: string }>(
  items: readonly T[] | undefined,
  id: string,
): T[] => (items ?? []).filter((entry) => entry.id !== id);

/** Le righe cancellate restano nel database, ma non nella vista. */
export const withoutTombstones = <T extends { deletedAt: string | null }>(
  items: readonly T[] | undefined,
): T[] => (items ?? []).filter((entry) => entry.deletedAt === null);

/**
 * Un item di lista può essere in due cache contemporaneamente: la lista e la
 * sessione di spesa fusa. Aggiornarne una sola è il modo più facile di far
 * mentire la UI.
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

  client.setQueryData<ShoppingSession>(keys.shoppingSession(), (session) =>
    session === undefined
      ? session
      : {
          ...session,
          lists: session.lists.map((entry) =>
            entry.listId === listId
              ? {
                  ...entry,
                  items:
                    item.deletedAt === null
                      ? upsertById(entry.items, item)
                      : removeById(entry.items, item.id),
                }
              : entry,
          ),
        },
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

  client.setQueryData<ShoppingSession>(keys.shoppingSession(), (session) =>
    session === undefined
      ? session
      : {
          ...session,
          lists: session.lists.map((entry) =>
            entry.listId === listId
              ? { ...entry, items: removeById(entry.items, itemId) }
              : entry,
          ),
        },
  );
};

export const upsertPantryNode = (
  client: QueryClient,
  pantryId: string,
  node: PantryNode,
): void => {
  client.setQueryData<PantryNode[]>(keys.pantryNodes(pantryId), (current) =>
    node.deletedAt === null
      ? upsertById(current, node)
      : removeById(current, node.id),
  );
};

export const removePantryNode = (
  client: QueryClient,
  pantryId: string,
  nodeId: string,
): void => {
  client.setQueryData<PantryNode[]>(keys.pantryNodes(pantryId), (current) =>
    removeById(current, nodeId),
  );
};

/** Snapshot di una singola voce, per poter tornare indietro su errore. */
export const findListItem = (
  client: QueryClient,
  listId: string,
  itemId: string,
): ListItem | undefined =>
  client
    .getQueryData<ListItem[]>(keys.listItems(listId))
    ?.find((entry) => entry.id === itemId);

export const findPantryNode = (
  client: QueryClient,
  pantryId: string,
  nodeId: string,
): PantryNode | undefined =>
  client
    .getQueryData<PantryNode[]>(keys.pantryNodes(pantryId))
    ?.find((entry) => entry.id === nodeId);
