import { describe, expect, it } from "vitest";

import { MAX_CONTACT_LENGTH } from "../src/constants.js";
import { emailSchema } from "../src/schemas/common.js";

describe("emailSchema", () => {
  it("normalises case and surrounding space", () => {
    expect(emailSchema.parse("  Mario.Rossi@Example.COM ")).toBe(
      "mario.rossi@example.com",
    );
  });

  it("rejects an address longer than the contact cap", () => {
    const local = "a".repeat(MAX_CONTACT_LENGTH);

    expect(emailSchema.safeParse(`${local}@example.com`).success).toBe(false);
  });

  it("caps the length before parsing the format", () => {
    const issues = emailSchema.safeParse("x".repeat(100_000)).error?.issues;

    expect(issues).toHaveLength(1);
    expect(issues?.[0]?.code).toBe("too_big");
  });

  it("accepts an ordinary address", () => {
    expect(emailSchema.parse("newcomer@example.com")).toBe(
      "newcomer@example.com",
    );
  });
});
