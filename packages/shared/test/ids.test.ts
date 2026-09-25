import { describe, expect, it } from "vitest";

import { isUuidV7, uuidv7, uuidv7Timestamp } from "../src/ids.js";

describe("uuidv7", () => {
  it("produces something that reads as a version 7 uuid", () => {
    expect(isUuidV7(uuidv7())).toBe(true);
  });

  it("rejects a uuid of another version", () => {
    expect(isUuidV7("0199a0d0-0000-4000-8000-000000000001")).toBe(false);
  });

  it("carries the minting time in its first bits", () => {
    // Ahead of anything else this file asks for, because the generator keeps a
    // module-level high-water mark: handing it an earlier instant would
    // correctly give back the mark instead, which is the next test.
    const now = Date.now() + 60_000;

    expect(uuidv7Timestamp(uuidv7(now))).toBe(now);
  });

  it("keeps a high-water mark, so an earlier instant does not rewind it", () => {
    const ahead = Date.now() + 120_000;
    uuidv7(ahead);

    expect(uuidv7Timestamp(uuidv7(Date.now()))).toBeGreaterThanOrEqual(ahead);
  });

  it("keeps rising within a single millisecond", () => {
    const now = Date.now();
    const ids = Array.from({ length: 500 }, () => uuidv7(now));

    expect([...ids].sort()).toEqual(ids);
  });

  it("never repeats an id", () => {
    const now = Date.now();
    const ids = Array.from({ length: 2000 }, () => uuidv7(now));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not go backwards when the clock does", () => {
    const now = Date.now();
    const before = uuidv7(now);
    // NTP correction, or waking from sleep.
    const after = uuidv7(now - 60_000);

    expect(after > before).toBe(true);
  });

  it("orders by creation, which is what the list relies on", () => {
    const first = uuidv7(1_000);
    const second = uuidv7(2_000);

    expect([second, first].sort()).toEqual([first, second]);
  });
});
