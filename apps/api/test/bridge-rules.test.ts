import { describe, expect, it } from "vitest";

import { suggestedQuantity } from "../src/services/bridge.service.js";

describe("suggestedQuantity", () => {
  it("propone il divario dalla soglia", () => {
    expect(suggestedQuantity(1, 4)).toBe(3);
  });

  it("propone almeno uno quando la giacenza è esattamente alla soglia", () => {
    expect(suggestedQuantity(2, 2)).toBe(1);
  });

  it("tratta la giacenza assente come zero", () => {
    expect(suggestedQuantity(null, 3)).toBe(3);
  });

  it("non propone nulla senza soglia", () => {
    expect(suggestedQuantity(0, null)).toBeNull();
  });
});
