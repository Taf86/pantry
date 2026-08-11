import type { QueryClient } from "@tanstack/react-query";
import {
  JOIN_EVENT,
  LEAVE_EVENT,
  SERVER_EVENT,
  serverEventSchema,
  type ServerEvent,
} from "pantry-shared";
import { io, type Socket } from "socket.io-client";

import {
  removeListItem,
  removePantryNode,
  upsertListItem,
  upsertPantryNode,
} from "./cache";
import { keys } from "./keys";

/**
 * Il socket riceve solo notifiche: nessuna mutazione ci passa mai attraverso.
 *
 * È la divisione dei canali della specifica — tRPC su HTTP dà tipi e
 * validazione sul percorso critico, Socket.IO dà la riconnessione con backoff
 * sul percorso di notifica, che è quello che serve su rete mobile ballerina.
 */
export const applyServerEvent = (
  client: QueryClient,
  event: ServerEvent,
): void => {
  switch (event.type) {
    case "item.upserted":
      upsertListItem(client, event.listId, event.item);
      break;
    case "item.deleted":
      removeListItem(client, event.listId, event.itemId);
      break;
    case "list.updated":
    case "list.deleted":
      void client.invalidateQueries({ queryKey: keys.lists() });
      void client.invalidateQueries({ queryKey: keys.list(event.listId) });
      break;
    case "pantry.node.upserted":
      upsertPantryNode(client, event.pantryId, event.node);
      break;
    case "pantry.node.deleted":
      removePantryNode(client, event.pantryId, event.nodeId);
      break;
    case "pantry.updated":
    case "pantry.deleted":
      void client.invalidateQueries({ queryKey: keys.pantries() });
      break;
  }
};

export interface RoomSubscription {
  lists?: string[];
  pantries?: string[];
}

export const createSocket = (client: QueryClient): Socket => {
  const socket = io({
    path: "/socket.io",
    // La connessione si apre solo quando c'è una sessione: l'handshake senza
    // cookie verrebbe respinto, e ritentato in loop dal backoff.
    autoConnect: false,
    // Il cookie di sessione viaggia con l'handshake: stessa origin.
    withCredentials: true,
    // Il backoff è il motivo per cui c'è Socket.IO invece di `ws` nudo.
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
  });

  socket.on(SERVER_EVENT, (payload: unknown) => {
    const parsed = serverEventSchema.safeParse(payload);
    // Un evento malformato si ignora: la cache non si corrompe per un
    // messaggio inatteso, e al prossimo refetch la verità torna dal server.
    if (parsed.success) applyServerEvent(client, parsed.data);
  });

  return socket;
};

export const joinRooms = (socket: Socket, rooms: RoomSubscription): void => {
  socket.emit(JOIN_EVENT, {
    lists: rooms.lists ?? [],
    pantries: rooms.pantries ?? [],
  });
};

export const leaveRooms = (socket: Socket, rooms: RoomSubscription): void => {
  socket.emit(LEAVE_EVENT, {
    lists: rooms.lists ?? [],
    pantries: rooms.pantries ?? [],
  });
};
