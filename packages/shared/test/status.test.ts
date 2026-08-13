import { describe, expect, it } from "vitest";

import {
  daysUntil,
  expiryStatus,
  isBelowThreshold,
} from "../src/domain/status.js";
import { makeNode } from "./factories.js";

const today = new Date("2026-08-11T22:00:00.000Z");

describe("isBelowThreshold", () => {
  it("segnala l'item alla soglia, non solo sotto", () => {
    const node = makeNode({ kind: "item", quantity: 1, minQuantity: 1 });
    expect(isBelowThreshold(node)).toBe(true);
  });

  it("tace quando non c'è una soglia", () => {
    const node = makeNode({ kind: "item", quantity: 0, minQuantity: null });
    expect(isBelowThreshold(node)).toBe(false);
  });

  it("tratta la quantità assente come zero", () => {
    const node = makeNode({ kind: "item", quantity: null, minQuantity: 2 });
    expect(isBelowThreshold(node)).toBe(true);
  });

  it("ignora i contenitori", () => {
    const node = makeNode({ kind: "container", quantity: 0, minQuantity: 5 });
    expect(isBelowThreshold(node)).toBe(false);
  });

  it("ignora i tombstone", () => {
    const node = makeNode({
      kind: "item",
      quantity: 0,
      minQuantity: 5,
      deletedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(isBelowThreshold(node)).toBe(false);
  });
});

describe("daysUntil", () => {
  it("conta i giorni interi, ignorando l'ora", () => {
    expect(daysUntil("2026-08-14", today)).toBe(3);
    expect(daysUntil("2026-08-11", today)).toBe(0);
  });

  it("è negativo per una data passata", () => {
    expect(daysUntil("2026-08-09", today)).toBe(-2);
  });
});

describe("expiryStatus", () => {
  const item = (expiresAt: string | null) =>
    makeNode({ kind: "item", expiresAt });

  it("classifica scaduto, in scadenza e buono", () => {
    expect(expiryStatus(item("2026-08-01"), 7, today)).toBe("expired");
    expect(expiryStatus(item("2026-08-15"), 7, today)).toBe("expiring");
    expect(expiryStatus(item("2026-09-30"), 7, today)).toBe("fresh");
  });

  it("include l'ultimo giorno della finestra", () => {
    expect(expiryStatus(item("2026-08-18"), 7, today)).toBe("expiring");
    expect(expiryStatus(item("2026-08-19"), 7, today)).toBe("fresh");
  });

  it("è sconosciuto senza data o per un contenitore", () => {
    expect(expiryStatus(item(null), 7, today)).toBe("unknown");
    expect(
      expiryStatus(
        makeNode({ kind: "container", expiresAt: "2026-08-12" }),
        7,
        today,
      ),
    ).toBe("unknown");
  });
});
