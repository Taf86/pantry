import { requestQueuedNotification } from "@pantry/shared";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AppConfig, PushConfig } from "../../src/config/env.js";
import { pushSubscriptions } from "../../src/db/schema/push-subscriptions.js";
import { users } from "../../src/db/schema/users.js";
import {
  notifyAdmins,
  registerSubscription,
  removeSubscription,
  sweepStalePushSubscriptions,
} from "../../src/services/push/push.service.js";
import type {
  PushResult,
  PushSender,
} from "../../src/services/push/webpush.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MS_PER_DAY = 86_400_000;

const VAPID: PushConfig = {
  publicKey: "test-public-key",
  privateKey: "test-private-key",
  subject: "mailto:admin@test.local",
};

const endpointFor = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;

const subscription = (id: string) => ({
  endpoint: endpointFor(id),
  keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` },
});

const senderReturning = (byEndpoint: Record<string, number> = {}) => {
  const calls: { endpoint: string; payload: string; topic?: string }[] = [];
  const send: PushSender = (_vapid, target, payload, options) => {
    calls.push({
      endpoint: target.endpoint,
      payload,
      ...(options?.topic === undefined ? {} : { topic: options.topic }),
    });
    return Promise.resolve<PushResult>({
      endpoint: target.endpoint,
      status: byEndpoint[target.endpoint] ?? 201,
    });
  };
  return { send, calls };
};

describe("push", () => {
  let harness: Harness;
  let admin: string;
  let configured: AppConfig;

  const logger = { warn: vi.fn(), error: vi.fn() };

  beforeAll(async () => {
    harness = await createHarness();
    configured = { ...harness.config, push: VAPID };
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    vi.clearAllMocks();
    admin = await makeUser(harness, {
      email: "admin@example.com",
      role: "admin",
    });
  });

  const deps = () => ({ db: harness.db });
  const sendDeps = (send: PushSender) => ({
    db: harness.db,
    config: configured,
    logger: logger as never,
    send,
  });

  const rows = () =>
    harness.db.select().from(pushSubscriptions).orderBy(pushSubscriptions.id);

  describe("registerSubscription", () => {
    it("stores a device", async () => {
      await registerSubscription(deps(), admin, {
        ...subscription("a"),
        userAgent: "Firefox",
      });

      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        userId: admin,
        endpoint: endpointFor("a"),
        p256dh: "p256dh-a",
        userAgent: "Firefox",
      });
    });

    it("updates the same endpoint instead of duplicating it", async () => {
      await registerSubscription(deps(), admin, subscription("a"));
      const [first] = await rows();

      await registerSubscription(deps(), admin, {
        endpoint: endpointFor("a"),
        keys: { p256dh: "rotated", auth: "rotated-auth" },
      });

      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.p256dh).toBe("rotated");
      expect(stored[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
        first?.lastSeenAt.getTime() ?? 0,
      );
    });

    it("re-points a device where someone else signs in", async () => {
      const other = await makeUser(harness, { email: "other@example.com" });

      await registerSubscription(deps(), admin, subscription("a"));
      await registerSubscription(deps(), other, subscription("a"));

      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.userId).toBe(other);
    });

    it("refuses an endpoint that is not a known push service", async () => {
      await expect(
        registerSubscription(deps(), admin, {
          endpoint: "https://attacker.example.com/collect",
          keys: { p256dh: "x", auth: "y" },
        }),
      ).rejects.toThrow(/push service/i);

      expect(await rows()).toHaveLength(0);
    });

    it("evicts the least recently seen device past the cap", async () => {
      for (const id of ["a", "b", "c", "d", "e", "f"]) {
        await registerSubscription(deps(), admin, subscription(id));
      }

      const stored = await rows();
      expect(stored).toHaveLength(5);
      expect(stored.map((row) => row.endpoint)).not.toContain(endpointFor("a"));
    });
  });

  describe("removeSubscription", () => {
    it("removes only the caller's own device", async () => {
      const other = await makeUser(harness, { email: "other@example.com" });
      await registerSubscription(deps(), admin, subscription("a"));
      await registerSubscription(deps(), other, subscription("b"));

      await removeSubscription(deps(), other, endpointFor("a"));
      expect(await rows()).toHaveLength(2);

      await removeSubscription(deps(), admin, endpointFor("a"));
      expect(await rows()).toHaveLength(1);
    });

    it("takes a user's devices with them when they are deleted", async () => {
      await registerSubscription(deps(), admin, subscription("a"));

      await harness.db.delete(users).where(eq(users.id, admin));

      expect(await rows()).toHaveLength(0);
    });

    it("sweeps devices nothing has confirmed for the retention window", async () => {
      await registerSubscription(deps(), admin, subscription("a"));
      await registerSubscription(deps(), admin, subscription("b"));

      await harness.db
        .update(pushSubscriptions)
        .set({ lastSeenAt: new Date(Date.now() - 91 * MS_PER_DAY) })
        .where(eq(pushSubscriptions.endpoint, endpointFor("a")));

      expect(await sweepStalePushSubscriptions(harness.db)).toBe(1);
      expect((await rows())[0]?.endpoint).toBe(endpointFor("b"));
    });
  });

  describe("notifyAdmins", () => {
    const notification = requestQueuedNotification(3);

    it("reaches every device of every active admin", async () => {
      const secondAdmin = await makeUser(harness, {
        email: "admin2@example.com",
        role: "admin",
      });
      await registerSubscription(deps(), admin, subscription("a"));
      await registerSubscription(deps(), admin, subscription("b"));
      await registerSubscription(deps(), secondAdmin, subscription("c"));

      const { send, calls } = senderReturning();
      await notifyAdmins(sendDeps(send), notification);

      expect(calls.map((call) => call.endpoint).sort()).toEqual(
        ["a", "b", "c"].map(endpointFor).sort(),
      );
      expect(calls[0]?.topic).toBe("pantry-requests");
    });

    it("skips plain users and admins who are not active", async () => {
      const plain = await makeUser(harness, { email: "user@example.com" });
      const suspended = await makeUser(harness, {
        email: "susp@example.com",
        role: "admin",
        status: "suspended",
      });
      await registerSubscription(deps(), plain, subscription("a"));
      await registerSubscription(deps(), suspended, subscription("b"));
      await registerSubscription(deps(), admin, subscription("c"));

      const { send, calls } = senderReturning();
      await notifyAdmins(sendDeps(send), notification);

      expect(calls).toHaveLength(1);
      expect(calls[0]?.endpoint).toBe(endpointFor("c"));
    });

    it("forgets a subscription the push service says is gone", async () => {
      await registerSubscription(deps(), admin, subscription("a"));
      await registerSubscription(deps(), admin, subscription("b"));

      const { send } = senderReturning({ [endpointFor("a")]: 410 });
      await notifyAdmins(sendDeps(send), notification);

      expect((await rows()).map((row) => row.endpoint)).toEqual([
        endpointFor("b"),
      ]);
    });

    it("keeps a subscription through backpressure and config errors", async () => {
      // 429 and 5xx are the service asking for patience; 401 means our own
      // VAPID config is wrong. Deleting rows for either destroys recoverable
      // state.
      await registerSubscription(deps(), admin, subscription("a"));
      await registerSubscription(deps(), admin, subscription("b"));
      await registerSubscription(deps(), admin, subscription("c"));

      const { send } = senderReturning({
        [endpointFor("a")]: 429,
        [endpointFor("b")]: 503,
        [endpointFor("c")]: 401,
      });
      await notifyAdmins(sendDeps(send), notification);

      expect(await rows()).toHaveLength(3);
    });

    it("does nothing at all when no VAPID keys are configured", async () => {
      await registerSubscription(deps(), admin, subscription("a"));

      const { send, calls } = senderReturning();
      await notifyAdmins(
        {
          db: harness.db,
          config: harness.config,
          logger: logger as never,
          send,
        },
        notification,
      );

      expect(harness.config.push).toBeNull();
      expect(calls).toHaveLength(0);
    });

    it("survives a sender that rejects outright", async () => {
      await registerSubscription(deps(), admin, subscription("a"));

      const send: PushSender = () => Promise.reject(new Error("network down"));

      await expect(
        notifyAdmins(sendDeps(send), notification),
      ).resolves.toBeUndefined();
      expect(await rows()).toHaveLength(1);
    });
  });
});
