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

/** socket.io-client sockets are not Node EventEmitters, so `once` is out. */
const connected = (socket: Socket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once("connect", () => {
      resolve();
    });
    socket.once("connect_error", (error: Error) => {
      reject(error);
    });
  });

/** The cookie the stub below reads an identity out of. */
export const TEST_COOKIE = "pantry-test-user";

/**
 * Better Auth stands in for identity resolution here.
 *
 * What these tests are about is authorization and routing — who may join which
 * room, where an event lands, whether a removed member stops hearing about a
 * list. Driving a real password sign-in to get a signed session cookie would
 * test Better Auth, which already tests itself, and would make the interesting
 * assertions harder to read.
 */
const stubAuth = (statusOf: (id: string) => string): Auth =>
  ({
    api: {
      getSession: ({ headers }: { headers: Headers }) => {
        const cookie = headers.get("cookie") ?? "";
        const match = new RegExp(`${TEST_COOKIE}=([^;]+)`).exec(cookie);
        if (!match) return Promise.resolve(null);
        const id = match[1]!;
        return Promise.resolve({
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
  /** Opens a client socket authenticated as `userId`, already connected. */
  open: (userId: string) => Promise<Socket>;
  /** Opens a client socket with no session at all. */
  openAnonymous: () => Socket;
  close: () => Promise<void>;
}

export const createRealtimeHarness = async (
  harness: Harness,
  options: { statusOf?: (id: string) => string } = {},
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
    auth: stubAuth(options.statusOf ?? (() => "active")),
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

    open: async (userId) => {
      const socket = track(
        connect(url, {
          path: REALTIME_PATH,
          transports: ["polling"],
          extraHeaders: { cookie: `${TEST_COOKIE}=${userId}` },
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

/** Collects the events a socket receives, for assertions after a settle. */
export const collect = (socket: Socket): ServerEvent[] => {
  const received: ServerEvent[] = [];
  socket.on(SERVER_EVENT, (event: ServerEvent) => received.push(event));
  return received;
};

/** Socket.IO delivery is asynchronous; this is the settle before asserting. */
export const settle = (ms = 120): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
