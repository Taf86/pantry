import { describe, expect, it } from "vitest";

import {
  ClaimState,
  SessionEndReason,
  claimState,
  isSessionConflict,
  type ShoppingSession,
} from "../src/schemas/shopping.js";

const NOW = Date.parse("2026-09-24T10:00:00.000Z");
const HOUR = 3_600_000;

const session = (
  overrides: Partial<ShoppingSession> = {},
): Pick<ShoppingSession, "holder" | "expiresAt" | "endedAt"> => ({
  holder: { id: "marco", email: "marco@example.com", displayName: "Marco" },
  expiresAt: new Date(NOW + HOUR).toISOString(),
  endedAt: null,
  ...overrides,
});

describe("claimState", () => {
  it("reports a list nobody has taken as free", () => {
    expect(claimState(null, "anna", NOW)).toBe(ClaimState.free);
  });

  it("reports an ended session as free, whatever its expiry says", () => {
    const ended = session({
      endedAt: new Date(NOW - HOUR).toISOString(),
      expiresAt: new Date(NOW + HOUR).toISOString(),
    });

    expect(claimState(ended, "anna", NOW)).toBe(ClaimState.free);
  });

  it("tells the holder apart from everyone else", () => {
    expect(claimState(session(), "marco", NOW)).toBe(ClaimState.mine);
    expect(claimState(session(), "anna", NOW)).toBe(ClaimState.other);
  });

  it("distinguishes an expired lease of mine from an expired lease of theirs", () => {
    const stale = session({ expiresAt: new Date(NOW - 1).toISOString() });

    expect(claimState(stale, "marco", NOW)).toBe(ClaimState.mineExpired);
    expect(claimState(stale, "anna", NOW)).toBe(ClaimState.otherExpired);
  });

  it("treats the exact moment of expiry as expired", () => {
    const boundary = session({ expiresAt: new Date(NOW).toISOString() });

    expect(claimState(boundary, "marco", NOW)).toBe(ClaimState.mineExpired);
  });
});

describe("isSessionConflict", () => {
  it("accepts a conflict that names no holder", () => {
    expect(isSessionConflict({ code: "session_held", session: null })).toBe(
      true,
    );
  });

  it("rejects anything else that turns up in the error payload", () => {
    expect(isSessionConflict({ code: "nope" })).toBe(false);
    expect(isSessionConflict(null)).toBe(false);
  });
});

describe("SessionEndReason", () => {
  it("keeps a taken-over session distinguishable from an abandoned one", () => {
    expect(SessionEndReason.taken_over).not.toBe(SessionEndReason.expired);
  });
});
