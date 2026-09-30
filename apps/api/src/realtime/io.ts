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
  cookie: string;
}

export interface Realtime {
  io: Server;
  bus: EventBus;
  close: () => Promise<void>;
}

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const dataOf = (socket: Socket): SocketData => socket.data as SocketData;
const userIdOf = (socket: Socket): string => dataOf(socket).userId;

export const createRealtime = (
  httpServer: HttpServer,
  services: AppServices,
): Realtime => {
  const io = new Server(httpServer, {
    path: REALTIME_PATH,
    serveClient: false,
    cors: { origin: services.config.trustedOrigins, credentials: true },
  });

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
