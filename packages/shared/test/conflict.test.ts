import { describe, expect, it } from "vitest";

import {
  CONFLICT_CODE,
  isConflictPayload,
  resolveCheck,
} from "../src/domain/conflict";

describe("resolveCheck", () => {
  it("applica una spunta più recente dell'ultimo cambiamento", () => {
    expect(
      resolveCheck(
        null,
        "2026-08-11T18:00:00.000Z",
        "2026-08-11T18:03:00.000Z",
        "2026-08-11T18:03:00.000Z",
      ),
    ).toEqual({ apply: true, checkedAt: "2026-08-11T18:03:00.000Z" });
  });

  it("scarta una spunta arrivata tardi ma avvenuta prima della de-spunta", () => {
    const result = resolveCheck(
      null,
      "2026-08-11T18:20:00.000Z",
      "2026-08-11T18:03:00.000Z",
      "2026-08-11T18:03:00.000Z",
    );
    expect(result.apply).toBe(false);
    expect(result.checkedAt).toBeNull();
  });

  it("permette la de-spunta di una spunta anteriore", () => {
    expect(
      resolveCheck(
        "2026-08-11T18:03:00.000Z",
        "2026-08-11T18:03:00.000Z",
        "2026-08-11T18:20:00.000Z",
        null,
      ),
    ).toEqual({ apply: true, checkedAt: null });
  });

  it("non lascia che una de-spunta vecchia annulli una spunta più recente", () => {
    const result = resolveCheck(
      "2026-08-11T18:30:00.000Z",
      "2026-08-11T18:30:00.000Z",
      "2026-08-11T18:20:00.000Z",
      null,
    );
    expect(result).toEqual({
      apply: false,
      checkedAt: "2026-08-11T18:30:00.000Z",
    });
  });

  it("è idempotente: rigiocare la stessa spunta non cambia nulla", () => {
    const at = "2026-08-11T18:03:00.000Z";
    const first = resolveCheck(null, "2026-08-11T17:00:00.000Z", at, at);
    const second = resolveCheck(first.checkedAt, at, at, at);
    expect(second).toEqual({ apply: true, checkedAt: at });
  });
});

describe("isConflictPayload", () => {
  it("riconosce il payload allegato a un CONFLICT", () => {
    expect(isConflictPayload({ code: CONFLICT_CODE, current: null })).toBe(
      true,
    );
  });

  it("rifiuta qualunque altra cosa", () => {
    expect(isConflictPayload(null)).toBe(false);
    expect(isConflictPayload({ code: "ALTRO" })).toBe(false);
    expect(isConflictPayload("VERSION_CONFLICT")).toBe(false);
  });
});
