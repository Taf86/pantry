import type { Server as HttpServer } from "node:http";

import {
  JOIN_EVENT,
  LEAVE_EVENT,
  Permission,
  REALTIME_PATH,
  SERVER_EVENT,
  can,
  joinPayloadSchema,
  listRoom,
  sessionRoom,
  userRoom,
} from "@pantry/shared";
import { Server, type Socket } from "socket.io";

import type { AppServices } from "../context.js";
import { getListMembership } from "../services/lists/membership.js";
import { resolveSession } from "../trpc/context.js";
import type { EventBus } from "./events.js";
import { roomsOf } from "./routing.js";

interface SocketData {
  userId: string;
  sessionId: string;
  expiresAt: Date;
  /** Kept to re-check the session when it is due to expire. */
  cookie: string;
}

export interface Realtime {
  io: Server;
  bus: EventBus;
  close: () => Promise<void>;
}

/** setTimeout overflows past this, firing at once; a 30-day session exceeds it. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const dataOf = (socket: Socket): SocketData => socket.data as SocketData;
const userIdOf = (socket: Socket): string => dataOf(socket).userId;

/**
 * Socket.IO: one namespace, one room per list, one room per user, one room
 * per session.
 *
 * Chosen over bare `ws` for exactly one reason — reconnection with backoff on
 * an unstable mobile network, handled properly. That is literally the
 * supermarket scenario, and it is the only thing this transport has to be
 * good at, because the socket never carries a mutation: writes all go through
 * tRPC over HTTP, where there are types and validation.
 */
export const createRealtime = (
  httpServer: HttpServer,
  services: AppServices,
): Realtime => {
  const io = new Server(httpServer, {
    path: REALTIME_PATH,
    serveClient: false,
    // Same origin, so there is no CORS to grant: the allowed list is the app's
    // own, and anything else has no business holding a socket here.
    cors: { origin: services.config.trustedOrigins, credentials: true },
  });

  /**
   * The session cookie travels with the handshake, because the SPA and the API
   * are served from one origin. That is the whole reason socket authentication
   * needs no custom header — which the browser would not allow on a handshake
   * anyway.
   */
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie;
    if (cookie === undefined) {
      next(new Error("unauthorized"));
      return;
    }

    void resolveSession(services, new Headers({ cookie }), { refresh: false })
      .then((session) => {
        if (!session || session.user.status !== "active") {
          next(new Error("unauthorized"));
          return;
        }
        const data: SocketData = {
          userId: session.user.id,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
          cookie,
        };
        socket.data = data;
        next();
      })
      .catch((error: unknown) => {
        services.logger.warn({ error }, "Socket handshake failed.");
        next(new Error("unauthorized"));
      });
  });

  /** Entering a room is an authorized read like any other. */
  const joinRooms = async (socket: Socket, payload: unknown): Promise<void> => {
    const parsed = joinPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const userId = userIdOf(socket);
    for (const listId of parsed.data.lists) {
      const membership = await getListMembership(services.db, listId, userId);
      if (membership && can(membership.permissions, Permission.Read)) {
        await socket.join(listRoom(listId));
      }
    }
  };

  /**
   * Disconnects the socket when its session expires.
   *
   * Not blindly: HTTP requests refresh a session while it is in use, so when
   * the timer fires the session is checked again, and a refreshed one just
   * moves the deadline. The server-side disconnect is final — the client does
   * not reconnect on its own, which is right for a session that is over.
   */
  const watchExpiry = (socket: Socket): void => {
    let timer: NodeJS.Timeout | undefined;

    const schedule = (expiresAt: Date): void => {
      const delay = Math.min(
        Math.max(expiresAt.getTime() - Date.now(), 0),
        MAX_TIMEOUT_MS,
      );
      timer = setTimeout(() => {
        void check();
      }, delay);
    };

    const check = async (): Promise<void> => {
      const data = dataOf(socket);
      const current = await resolveSession(
        services,
        new Headers({ cookie: data.cookie }),
        { refresh: false },
      ).catch((error: unknown) => {
        // A socket dropped by mistake reconnects and re-authenticates; one
        // kept by mistake leaks events. Failing closed is the cheap side.
        services.logger.warn({ error }, "Re-checking a socket session failed.");
        return null;
      });
      if (!socket.connected) return;

      if (
        !current ||
        current.sessionId !== data.sessionId ||
        current.user.status !== "active"
      ) {
        socket.disconnect(true);
        return;
      }
      data.expiresAt = current.expiresAt;
      schedule(current.expiresAt);
    };

    schedule(dataOf(socket).expiresAt);
    socket.once("disconnect", () => {
      clearTimeout(timer);
    });
  };

  io.on("connection", (socket) => {
    // Joined by the server, never on request: the identity came from the
    // session, so there is nothing to authorize, and no client payload can name
    // another user's room.
    void socket.join([
      userRoom(userIdOf(socket)),
      sessionRoom(dataOf(socket).sessionId),
    ]);
    watchExpiry(socket);

    socket.on(JOIN_EVENT, (payload: unknown) => {
      void joinRooms(socket, payload).catch((error: unknown) => {
        services.logger.warn({ error }, "Joining a room failed.");
      });
    });

    socket.on(LEAVE_EVENT, (payload: unknown) => {
      const parsed = joinPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      for (const listId of parsed.data.lists) {
        void socket.leave(listRoom(listId));
      }
    });
  });

  const bus: EventBus = {
    publish: (event) => {
      io.to(roomsOf(event)).emit(SERVER_EVENT, event);
    },

    /**
     * Telling a removed member they were removed is not enough: their socket
     * is still joined, and would keep receiving every item event for a list
     * they can no longer read. Membership is checked when joining, so nothing
     * re-checks it afterwards — this is what closes that door.
     */
    revoke: (listId, userId) => {
      const room = listRoom(listId);
      void io
        .in(room)
        .fetchSockets()
        .then((sockets) => {
          for (const socket of sockets) {
            if ((socket.data as SocketData).userId === userId) {
              void socket.leave(room);
            }
          }
        })
        .catch((error: unknown) => {
          services.logger.warn({ error }, "Revoking a room failed.");
        });
    },

    // Closing the connection, not leaving a room: a disconnected socket drops
    // out of every room it was in. The user and session rooms are only how the
    // sockets are found.
    disconnectUser: (userId) => {
      io.in(userRoom(userId)).disconnectSockets(true);
    },

    disconnectSession: (sessionId) => {
      io.in(sessionRoom(sessionId)).disconnectSockets(true);
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
