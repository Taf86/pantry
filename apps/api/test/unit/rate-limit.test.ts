import { describe, expect, it } from "vitest";

import {
  createLimiter,
  createLimiterSet,
  hashClientIp,
} from "../../src/server/rate-limit.js";

const clock = (start = 1_000_000) => {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
};

describe("createLimiter", () => {
  it("allows up to the maximum and refuses past it", () => {
    const limiter = createLimiter({ windowMs: 1000, max: 3, now: clock().now });

    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);

    limiter.stop();
  });

  it("counts each key separately", () => {
    const limiter = createLimiter({ windowMs: 1000, max: 1, now: clock().now });

    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);

    limiter.stop();
  });

  it("starts a fresh window once the old one has passed", () => {
    const time = clock();
    const limiter = createLimiter({ windowMs: 1000, max: 1, now: time.now });

    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);

    time.advance(1001);
    expect(limiter.take("a").ok).toBe(true);

    limiter.stop();
  });

  it("reports the seconds left in the window", () => {
    const time = clock();
    const limiter = createLimiter({ windowMs: 30_000, max: 1, now: time.now });

    limiter.take("a");
    time.advance(10_000);

    expect(limiter.take("a").retryAfter).toBe(20);
    limiter.stop();
  });

  it("peeks without spending a slot", () => {
    const limiter = createLimiter({ windowMs: 1000, max: 1, now: clock().now });

    expect(limiter.peek("a").ok).toBe(true);
    expect(limiter.peek("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.peek("a").ok).toBe(true);

    limiter.stop();
  });

  it("evicts rather than growing without bound", () => {
    const limiter = createLimiter({
      windowMs: 60_000,
      max: 1,
      maxKeys: 2,
      now: clock().now,
    });

    limiter.take("a");
    limiter.take("b");
    limiter.take("c");

    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("c").ok).toBe(false);

    limiter.stop();
  });
});

describe("createLimiterSet", () => {
  const windows = [
    { windowMs: 30_000, max: 1 },
    { windowMs: 3_600_000, max: 3 },
  ] as const;

  it("refuses as soon as the narrowest window says so", () => {
    const time = clock();
    const limiter = createLimiterSet(windows, { now: time.now });

    expect(limiter.take("ip").ok).toBe(true);
    expect(limiter.take("ip").ok).toBe(false);

    limiter.stop();
  });

  it("still holds the wider window after the narrow one has rolled", () => {
    const time = clock();
    const limiter = createLimiterSet(windows, { now: time.now });

    for (let i = 0; i < 3; i += 1) {
      expect(limiter.take("ip").ok).toBe(true);
      time.advance(31_000);
    }

    expect(limiter.take("ip").ok).toBe(false);

    limiter.stop();
  });

  it("does not charge the wider windows once a narrow one has refused", () => {
    const time = clock();
    const limiter = createLimiterSet(windows, { now: time.now });

    limiter.take("ip");
    for (let i = 0; i < 50; i += 1) limiter.take("ip");

    time.advance(31_000);
    expect(limiter.take("ip").ok).toBe(true);
    time.advance(31_000);
    expect(limiter.take("ip").ok).toBe(true);

    limiter.stop();
  });
});

describe("hashClientIp", () => {
  it("is stable for the same address and secret", () => {
    expect(hashClientIp("203.0.113.9", "secret")).toBe(
      hashClientIp("203.0.113.9", "secret"),
    );
  });

  it("separates different addresses and different secrets", () => {
    expect(hashClientIp("203.0.113.9", "secret")).not.toBe(
      hashClientIp("203.0.113.10", "secret"),
    );
    expect(hashClientIp("203.0.113.9", "secret")).not.toBe(
      hashClientIp("203.0.113.9", "other"),
    );
  });

  it("does not carry the address it was given", () => {
    expect(hashClientIp("203.0.113.9", "secret")).not.toContain("203");
  });
});
