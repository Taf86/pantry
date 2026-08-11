import type { Server as HttpServer } from "node:http";

import {
  JOIN_EVENT,
  LEAVE_EVENT,
  SERVER_EVENT,
  joinPayloadSchema,
  listRoom,
  pantryRoom,
  Permission,
} from "pantry-shared";
import { Server, type Socket } from "socket.io";

import type { AppServices } from "../context.js";
import { resolveUser } from "../trpc/context.js";
import {
  getListMembership,
  getPantryMembership,
} from "../services/membership.js";
import type { EventBus } from "./events.js";
import { roomOf } from "./routing.js";

interface SocketData {
  userId: string;
}

export interface Realtime {
  io: Server;
  bus: EventBus;
  close: () => Promise<void>;
}

/**
 * Socket.IO, un namespace, una room per lista e una per dispensa.
 *
 * La scelta rispetto a `ws` nudo è motivata da una cosa sola: la riconnessione
 * con backoff su rete mobile instabile. È letteralmente lo scenario del
 * supermercato.
 *
 * Il socket non trasporta mai mutazioni: riceve solo notifiche che il client
 * usa per aggiornare la propria cache.
 */
export const createRealtime = (
  httpServer: HttpServer,
  services: AppServices,
): Realtime => {
  const io = new Server(httpServer, {
    serveClient: false,
    // Stessa origin: nessun CORS da concedere.
    cors: { origin: services.config.trustedOrigins, credentials: true },
  });

  /**
   * Il cookie di sessione viaggia con l'handshake, perché frontend e API
   * stanno sulla stessa origin. È il motivo per cui l'autenticazione del
   * WebSocket non richiede header custom, che il browser non permetterebbe.
   */
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) {
      next(new Error("unauthorized"));
      return;
    }

    void resolveUser(services, new Headers({ cookie }))
      .then((user) => {
        if (!user || user.status !== "active") {
          next(new Error("unauthorized"));
          return;
        }
        (socket.data as SocketData).userId = user.id;
        next();
      })
      .catch((error: unknown) => {
        services.logger.warn({ error }, "handshake socket fallito");
        next(new Error("unauthorized"));
      });
  });

  const joinRooms = async (socket: Socket, payload: unknown): Promise<void> => {
    const parsed = joinPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const { userId } = socket.data as SocketData;

    // Entrare in una room è una lettura autorizzata come tutte le altre.
    for (const listId of parsed.data.lists) {
      const membership = await getListMembership(services.db, listId, userId);
      if (membership && (membership.permissions & Permission.Read) !== 0) {
        await socket.join(listRoom(listId));
      }
    }
    for (const pantryId of parsed.data.pantries) {
      const membership = await getPantryMembership(
        services.db,
        pantryId,
        userId,
      );
      if (membership && (membership.permissions & Permission.Read) !== 0) {
        await socket.join(pantryRoom(pantryId));
      }
    }
  };

  io.on("connection", (socket) => {
    socket.on(JOIN_EVENT, (payload: unknown) => {
      void joinRooms(socket, payload).catch((error: unknown) => {
        services.logger.warn({ error }, "join room fallito");
      });
    });

    socket.on(LEAVE_EVENT, (payload: unknown) => {
      const parsed = joinPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      for (const listId of parsed.data.lists)
        void socket.leave(listRoom(listId));
      for (const pantryId of parsed.data.pantries) {
        void socket.leave(pantryRoom(pantryId));
      }
    });
  });

  const bus: EventBus = {
    publish: (event) => {
      io.to(roomOf(event)).emit(SERVER_EVENT, event);
    },
  };

  return {
    io,
    bus,
    close: async () => {
      await io.close();
    },
  };
};
