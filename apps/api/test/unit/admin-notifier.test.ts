import type { PushNotification } from "@pantry/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNotifier } from "../../src/services/notifications/admin-notifier.js";

const COOLDOWN_MS = 600_000;

const harness = (overrides: { cooldownMs?: number } = {}) => {
  let at = 1_000_000;
  const timers = new Map<NodeJS.Timeout, { fireAt: number; fn: () => void }>();
  let nextId = 1;

  const sent: PushNotification[] = [];
  let pendingCount = 1;

  const notifier = createNotifier(
    {
      countPending: () => Promise.resolve(pendingCount),
      notify: (notification) => {
        sent.push(notification);
        return Promise.resolve();
      },
      logger: { error: vi.fn() },
    },
    {
      cooldownMs: overrides.cooldownMs ?? COOLDOWN_MS,
      maxPerHour: 6,
      now: () => at,
      setTimer: (fn, ms) => {
        const id = nextId++ as unknown as NodeJS.Timeout;
        timers.set(id, { fireAt: at + ms, fn });
        return id;
      },
      clearTimer: (id) => timers.delete(id),
    },
  );

  const advance = async (ms: number): Promise<void> => {
    at += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.fireAt > at) continue;
      timers.delete(id);
      timer.fn();
    }
    await Promise.resolve();
    await Promise.resolve();
  };

  return {
    notifier,
    sent,
    advance,
    setPending: (value: number) => {
      pendingCount = value;
    },
  };
};

const flush = () => Promise.resolve().then(() => undefined);

describe("createNotifier", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it("sends the first request at once", async () => {
    h.notifier.requestQueued();
    await flush();

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.url).toBe("/admin/requests");
  });

  it("folds a burst inside the cooldown into a single later send", async () => {
    h.notifier.requestQueued();
    await flush();

    h.setPending(101);
    for (let i = 0; i < 100; i += 1) h.notifier.requestQueued();
    await flush();

    expect(h.sent).toHaveLength(1);

    await h.advance(COOLDOWN_MS);

    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]?.body).toContain("101");
  });

  it("carries the count as read at send time, not an accumulator", async () => {
    h.notifier.requestQueued();
    await flush();

    h.notifier.requestQueued();
    h.notifier.requestQueued();
    h.setPending(2);

    await h.advance(COOLDOWN_MS);

    expect(h.sent[1]?.body).toContain("2");
  });

  it("holds an hourly ceiling even with a cooldown that would allow more", async () => {
    const fast = harness({ cooldownMs: 1000 });

    for (let i = 0; i < 60; i += 1) {
      fast.notifier.requestQueued();
      await fast.advance(1000);
    }

    expect(fast.sent).toHaveLength(6);
  });

  it("lets the ceiling roll once the hour has passed", async () => {
    const fast = harness({ cooldownMs: 1000 });

    for (let i = 0; i < 60; i += 1) {
      fast.notifier.requestQueued();
      await fast.advance(1000);
    }
    expect(fast.sent).toHaveLength(6);

    await fast.advance(3_600_001);
    fast.notifier.requestQueued();
    await flush();

    expect(fast.sent).toHaveLength(7);
  });

  it("stays quiet when the queue has been emptied meanwhile", async () => {
    h.setPending(0);
    h.notifier.requestQueued();
    await flush();

    expect(h.sent).toHaveLength(0);
  });

  it("says one request in the singular", async () => {
    h.notifier.requestQueued();
    await flush();

    expect(h.sent[0]?.body).toBe("1 richiesta in attesa di approvazione.");
  });

  it("swallows a failing send instead of letting it escape", async () => {
    const error = vi.fn();
    const notifier = createNotifier(
      {
        countPending: () => Promise.resolve(1),
        notify: () => Promise.reject(new Error("push service down")),
        logger: { error },
      },
      { cooldownMs: COOLDOWN_MS },
    );

    expect(() => {
      notifier.requestQueued();
    }).not.toThrow();
    await notifier.stop();

    expect(error).toHaveBeenCalled();
  });

  it("sends nothing more once stopped", async () => {
    await h.notifier.stop();
    h.notifier.requestQueued();
    await flush();

    expect(h.sent).toHaveLength(0);
  });
});
