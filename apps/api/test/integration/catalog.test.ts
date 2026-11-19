import { Categories, Units } from "@pantry/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLookups } from "../../src/services/catalog/catalog.service.js";
import { createHarness, type Harness } from "../helpers/harness.js";

describe("catalog lookups", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("seeds the categories exactly as the shared constants", async () => {
    const { categories } = await getLookups(harness);
    expect(categories).toEqual(Categories);
  });

  it("seeds the units exactly as the shared constants", async () => {
    const { units } = await getLookups(harness);
    expect(units).toEqual(Units);
  });

  it("keeps the lookups across a reset", async () => {
    await harness.reset();
    const { categories, units } = await getLookups(harness);
    expect(categories).toHaveLength(Categories.length);
    expect(units).toHaveLength(Units.length);
  });
});
