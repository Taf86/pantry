import { beforeEach, describe, expect, it, vi } from "vitest";

import { isUuidV7 } from "../src/ids";
import type * as IdsModule from "../src/ids";

/**
 * Il generatore tiene uno stato monotòno di modulo (ultimo timestamp +
 * contatore). Ogni test parte da un modulo fresco, altrimenti l'ordine dei
 * test diventa parte del contratto.
 */
const freshIds = async (): Promise<typeof IdsModule> => {
  vi.resetModules();
  return import("../src/ids");
};

describe("uuidv7", () => {
  let uuidv7: (now?: number) => string;
  let uuidv7Timestamp: (value: string) => number;

  beforeEach(async () => {
    const module = await freshIds();
    uuidv7 = module.uuidv7;
    uuidv7Timestamp = module.uuidv7Timestamp;
  });

  it("produce UUID con versione 7 e variante RFC 4122", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isUuidV7(uuidv7())).toBe(true);
    }
  });

  it("non collide su molte generazioni ravvicinate", () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => uuidv7()));
    expect(ids.size).toBe(5_000);
  });

  it("resta monotòno anche dentro lo stesso millisecondo", () => {
    const ids = Array.from({ length: 1_000 }, () => uuidv7(1_750_000_000_000));
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(1_000);
  });

  it("non regredisce se l'orologio torna indietro", () => {
    const later = uuidv7(1_750_000_000_000);
    const earlier = uuidv7(1_700_000_000_000);
    expect(earlier > later).toBe(true);
  });

  it("codifica il timestamp nei primi 48 bit", () => {
    const now = 1_752_000_000_000;
    expect(uuidv7Timestamp(uuidv7(now))).toBe(now);
  });

  it("prende in prestito il millisecondo successivo quando il contatore si esaurisce", () => {
    const now = 1_752_000_000_000;
    const ids = Array.from({ length: 5_000 }, () => uuidv7(now));
    expect(new Set(ids).size).toBe(5_000);
    expect(uuidv7Timestamp(ids.at(-1)!)).toBeGreaterThan(now);
  });
});

describe("isUuidV7", () => {
  it("rifiuta un UUID v4", () => {
    expect(isUuidV7("9f1c2b7a-3d4e-4f5a-8b6c-1d2e3f4a5b6c")).toBe(false);
  });

  it("rifiuta stringhe non conformi", () => {
    expect(isUuidV7("non-un-uuid")).toBe(false);
  });
});
