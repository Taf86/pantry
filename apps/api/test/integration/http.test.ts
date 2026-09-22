import { MAX_TRPC_BATCH_SIZE } from "@pantry/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createServerHarness, type ServerHarness } from "../helpers/harness.js";

describe("http surface", () => {
  let harness: ServerHarness;

  beforeAll(async () => {
    harness = await createServerHarness({
      httpLimit: { windowMs: 60_000, max: 5 },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const batchUrl = (paths: string[]) =>
    `/api/trpc/${paths.join(",")}?batch=1&input=${encodeURIComponent(
      JSON.stringify(Object.fromEntries(paths.map((_, i) => [i, null]))),
    )}`;

  describe("batching", () => {
    it("serves a batch at the cap", async () => {
      const response = await harness.app.inject({
        method: "GET",
        url: batchUrl(Array(MAX_TRPC_BATCH_SIZE).fill("account.me")),
        headers: { "x-forwarded-for": "203.0.113.1" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("refuses a batch over the cap before reading the body", async () => {
      const response = await harness.app.inject({
        method: "GET",
        url: batchUrl(Array(MAX_TRPC_BATCH_SIZE + 1).fill("account.me")),
        headers: { "x-forwarded-for": "203.0.113.2" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("is refused by the URL length too, for the longer procedure names", () => {
      const longest = "account.createRequest";
      expect(longest.length * MAX_TRPC_BATCH_SIZE).toBeGreaterThan(100);
    });
  });

  describe("client address", () => {
    it("takes the rightmost forwarded address, not the one the caller wrote", async () => {
      const hit = (spoofed: string) =>
        harness.app.inject({
          method: "GET",
          url: "/api/health",
          headers: { "x-forwarded-for": `${spoofed}, 198.51.100.7` },
        });

      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push((await hit(`203.0.113.${String(i)}`)).statusCode);
      }
      expect(statuses.filter((status) => status === 429)).not.toHaveLength(0);
    });

    it("keeps separate budgets for genuinely different peers", async () => {
      for (let i = 0; i < 5; i += 1) {
        await harness.app.inject({
          method: "GET",
          url: "/api/health",
          headers: { "x-forwarded-for": "198.51.100.8" },
        });
      }

      const other = await harness.app.inject({
        method: "GET",
        url: "/api/health",
        headers: { "x-forwarded-for": "198.51.100.9" },
      });

      expect(other.statusCode).toBe(200);
    });
  });

  describe("blanket limit", () => {
    it("answers 429 with a Retry-After once the budget is gone", async () => {
      const hit = () =>
        harness.app.inject({
          method: "GET",
          url: "/api/health",
          headers: { "x-forwarded-for": "198.51.100.10" },
        });

      for (let i = 0; i < 5; i += 1) expect((await hit()).statusCode).toBe(200);

      const refused = await hit();
      expect(refused.statusCode).toBe(429);
      expect(refused.headers["retry-after"]).toBeDefined();
    });
  });
});
