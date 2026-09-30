import { createServer, type Server as HttpServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { REALTIME_PATH, SERVER_EVENT, type ServerEvent } from "@pantry/shared";
import { io as connect, type Socket } from "socket.io-client";

import type { Auth } from "../../src/auth.js";
import type { AppServices } from "../../src/context.js";
import { createRealtime, type Realtime } from "../../src/realtime/io.js";
import { nullEventBus } from "../../src/realtime/events.js";
import { createLimiter, type AppLimits } from "../../src/server/rate-limit.js";
import { silentLogger, type Harness } from "./harness.js";

const connected = (socket: Socket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once("connect", () => {
      resolve();
    });
    socket.once("connect_error", (error: Error) => {
      reject(error);
    });
  });

export const TEST_COOKIE = "pantry-test-user";
export type SessionOf = (sessionId: string) => { expiresAt: Date } | null;

const FAR_FUTURE = new Date("2100-01-01T00:00:00Z");

const stubAuth = (
  statusOf: (id: string) => string,
  sessionOf: SessionOf,
): Auth =>
  ({
    api: {
      getSession: ({ headers }: { headers: Headers }) => {
        const cookie = headers.get("cookie") ?? "";
        const match = new RegExp(`${TEST_COOKIE}=([^:;]+):([^;]+)`).exec(
          cookie,
        );
        if (!match) return Promise.resolve(null);
        const id = match[1]!;
        const sessionId = match[2]!;
        const session = sessionOf(sessionId);
        if (!session || session.expiresAt.getTime() <= Date.now()) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          session: { id: sessionId, expiresAt: session.expiresAt },
          user: {
            id,
            email: `${id}@example.com`,
            name: id,
            role: "user",
            status: statusOf(id),
          },
        });
      },
    },
  }) as unknown as Auth;

export interface RealtimeHarness {
  realtime: Realtime;
  url: string;
  open: (userId: string, sessionId?: string) => Promise<Socket>;
  openAnonymous: () => Socket;
  close: () => Promise<void>;
}

export const createRealtimeHarness = async (
  harness: Harness,
  options: { statusOf?: (id: string) => string; sessionOf?: SessionOf } = {},
): Promise<RealtimeHarness> => {
  const limiter = createLimiter({ windowMs: 60_000, max: 1000 });
  const limits: AppLimits = {
    http: limiter,
    procedure: limiter,
    createRequest: limiter,
    createRequestGlobal: limiter,
    stop: () => {
      limiter.stop();
    },
  };

  const services: AppServices = {
    config: harness.config,
    db: harness.db,
    auth: stubAuth(
      options.statusOf ?? (() => "active"),
      options.sessionOf ?? (() => ({ expiresAt: FAR_FUTURE })),
    ),
    logger: silentLogger(),
    limits,
    events: nullEventBus,
    notifier: { requestQueued: () => undefined, stop: () => Promise.resolve() },
  };

  const httpServer: HttpServer = createServer();
  const realtime = createRealtime(httpServer, services);
  httpServer.listen(0);
  await once(httpServer, "listening");

  const { port } = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${String(port)}`;
  const clients: Socket[] = [];

  const track = (socket: Socket): Socket => {
    clients.push(socket);
    return socket;
  };

  return {
    realtime,
    url,

    open: async (userId, sessionId = `${userId}-session`) => {
      const socket = track(
        connect(url, {
          path: REALTIME_PATH,
          transports: ["polling"],
          extraHeaders: { cookie: `${TEST_COOKIE}=${userId}:${sessionId}` },
          reconnection: false,
        }),
      );
      await connected(socket);
      return socket;
    },

    openAnonymous: () =>
      track(
        connect(url, {
          path: REALTIME_PATH,
          transports: ["polling"],
          reconnection: false,
        }),
      ),

    close: async () => {
      for (const client of clients) client.disconnect();
      await realtime.close();
      limits.stop();
      httpServer.close();
    },
  };
};

export const collect = (socket: Socket): ServerEvent[] => {
  const received: ServerEvent[] = [];
  socket.on(SERVER_EVENT, (event: ServerEvent) => received.push(event));
  return received;
};

export const settle = (ms = 120): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
