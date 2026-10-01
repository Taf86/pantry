import { describe, expect, it } from "vitest";

import { MAX_CONTACT_LENGTH } from "../src/constants.js";
import {
  ALL_PERMISSIONS,
  Permission,
  ROLE_NAMES,
  Role,
} from "../src/permissions.js";
import {
  MAX_JOINED_ROOMS,
  joinPayloadSchema,
  serverEventSchema,
} from "../src/events.js";
import {
  emailSchema,
  grantablePermissionsSchema,
  permissionsSchema,
} from "../src/schemas/common.js";

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

describe("grantablePermissionsSchema", () => {
  it("accepts the mask of every named role", () => {
    for (const name of ROLE_NAMES) {
      expect(grantablePermissionsSchema.safeParse(Role[name]).success).toBe(
        true,
      );
    }
  });

  it("rejects any mask that leaves Read out", () => {
    for (const mask of [
      Permission.Write,
      Permission.Shop,
      Permission.Manage,
      ALL_PERMISSIONS & ~Permission.Read,
    ]) {
      expect(grantablePermissionsSchema.safeParse(mask).success).toBe(false);
    }
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
