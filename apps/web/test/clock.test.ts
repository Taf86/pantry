import { afterEach, describe, expect, it, vi } from "vitest";

import {
  contentStamp,
  now,
  nowIso,
  recordServerTime,
  resetClockOffset,
} from "@/lib/clock";

afterEach(() => {
  resetClockOffset();
  vi.useRealTimers();
});

describe("contentStamp", () => {
  it("beats the row it was made against, even on a clock an hour behind", () => {
    const rowWrittenAt = new Date(Date.now() + 3_600_000).toISOString();

    const stamp = contentStamp(rowWrittenAt);

    expect(Date.parse(stamp)).toBeGreaterThan(Date.parse(rowWrittenAt));
  });

  it("uses the device clock when the row is older", () => {
    const old = new Date(Date.now() - 3_600_000).toISOString();

    expect(Date.parse(contentStamp(old))).toBeGreaterThanOrEqual(
      Date.now() - 50,
    );
  });

  it("handles a row that has no stamp yet", () => {
    expect(Number.isNaN(Date.parse(contentStamp(null)))).toBe(false);
    expect(Number.isNaN(Date.parse(contentStamp(undefined)))).toBe(false);
  });

  it("survives a stamp that is not a date at all", () => {
    expect(Number.isNaN(Date.parse(contentStamp("not a date")))).toBe(false);
  });
});

describe("the server offset", () => {
  it("corrects a device running behind", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"));

    recordServerTime("2026-09-25T10:05:00.000Z");

    expect(now()).toBe(Date.parse("2026-09-25T10:05:00.000Z"));
    expect(nowIso()).toBe("2026-09-25T10:05:00.000Z");
  });

  it("ignores a server time it cannot read", () => {
    const before = now();
    recordServerTime("nonsense");

    expect(now() - before).toBeLessThan(50);
  });
});
