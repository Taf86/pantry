import { describe, expect, it } from "vitest";

import { MAX_CHECK_BATCH, MAX_CONTACT_LENGTH } from "../src/constants.js";
import { ALL_PERMISSIONS, ROLE_NAMES, Role } from "../src/permissions.js";
import {
  MAX_JOINED_ROOMS,
  joinPayloadSchema,
  serverEventSchema,
} from "../src/events.js";
import { emailSchema, permissionsSchema } from "../src/schemas/common.js";
import {
  addItemInputSchema,
  checkManyInputSchema,
} from "../src/schemas/items.js";

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

describe("permissionsSchema", () => {
  it("accepts the mask of every named role", () => {
    for (const name of ROLE_NAMES) {
      expect(permissionsSchema.safeParse(Role[name]).success).toBe(true);
    }
  });

  it("rejects a mask carrying a bit the model does not define", () => {
    expect(permissionsSchema.safeParse(ALL_PERMISSIONS + 1).success).toBe(
      false,
    );
  });

  it("rejects a negative mask", () => {
    expect(permissionsSchema.safeParse(-1).success).toBe(false);
  });
});

describe("addItemInputSchema", () => {
  const valid = {
    mutationId: "0199a0d0-0000-7000-8000-000000000001",
    listId: "0199a0d0-0000-7000-8000-000000000002",
    id: "0199a0d0-0000-7000-8000-000000000003",
    contentUpdatedAt: "2026-09-24T10:00:00.000Z",
    rawText: "2 kg patate",
    name: "patate",
    quantity: 2,
    unit: "kg",
    unitText: null,
    note: null,
    categoryId: "produce",
  };

  it("always demands a mutation id, or the queue would apply a retry twice", () => {
    const withoutId: Record<string, unknown> = { ...valid };
    delete withoutId.mutationId;

    expect(addItemInputSchema.safeParse(withoutId).success).toBe(false);
  });

  it("accepts a fully parsed item", () => {
    expect(addItemInputSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses an item carrying a canonical unit and raw unit text at once", () => {
    expect(
      addItemInputSchema.safeParse({ ...valid, unitText: "mazzi" }).success,
    ).toBe(false);
  });

  it("accepts a packaging word on its own", () => {
    expect(
      addItemInputSchema.safeParse({ ...valid, unit: null, unitText: "mazzi" })
        .success,
    ).toBe(true);
  });

  it("trims the name and rejects an empty one", () => {
    expect(addItemInputSchema.parse({ ...valid, name: "  patate " }).name).toBe(
      "patate",
    );
    expect(
      addItemInputSchema.safeParse({ ...valid, name: "   " }).success,
    ).toBe(false);
  });

  it("rejects a negative quantity", () => {
    expect(
      addItemInputSchema.safeParse({ ...valid, quantity: -1 }).success,
    ).toBe(false);
  });
});

describe("checkManyInputSchema", () => {
  const check = {
    listId: "0199a0d0-0000-7000-8000-000000000002",
    id: "0199a0d0-0000-7000-8000-000000000003",
    checkedAt: "2026-09-24T10:00:00.000Z",
    at: "2026-09-24T10:00:00.000Z",
  };

  it("refuses an empty batch", () => {
    expect(
      checkManyInputSchema.safeParse({
        mutationId: "0199a0d0-0000-7000-8000-000000000001",
        checks: [],
      }).success,
    ).toBe(false);
  });

  it("caps the batch the offline queue may send at once", () => {
    expect(
      checkManyInputSchema.safeParse({
        mutationId: "0199a0d0-0000-7000-8000-000000000001",
        checks: Array.from({ length: MAX_CHECK_BATCH + 1 }, () => check),
      }).success,
    ).toBe(false);
  });

  it("carries a null checkedAt to mean unchecking", () => {
    const parsed = checkManyInputSchema.parse({
      mutationId: "0199a0d0-0000-7000-8000-000000000001",
      checks: [{ ...check, checkedAt: null }],
    });

    expect(parsed.checks[0]?.checkedAt).toBeNull();
  });
});

describe("serverEventSchema", () => {
  it("rejects an event type nobody publishes", () => {
    expect(
      serverEventSchema.safeParse({ type: "item.exploded", listId: "x" })
        .success,
    ).toBe(false);
  });

  it("accepts a member removal expressed as null permissions", () => {
    expect(
      serverEventSchema.safeParse({
        type: "list.member.changed",
        listId: "0199a0d0-0000-7000-8000-000000000002",
        userId: "anna",
        permissions: null,
      }).success,
    ).toBe(true);
  });
});

describe("joinPayloadSchema", () => {
  it("refuses a join larger than the room cap, rather than truncating it", () => {
    const lists = Array.from(
      { length: MAX_JOINED_ROOMS + 1 },
      () => "0199a0d0-0000-7000-8000-000000000002",
    );

    expect(joinPayloadSchema.safeParse({ lists }).success).toBe(false);
  });

  it("defaults to joining nothing", () => {
    expect(joinPayloadSchema.parse({}).lists).toEqual([]);
  });
});
