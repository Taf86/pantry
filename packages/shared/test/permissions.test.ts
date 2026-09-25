import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  Permission,
  ROLE_NAMES,
  Role,
  can,
  describePermissions,
  roleOf,
  sanitizePermissions,
} from "../src/permissions.js";

describe("can", () => {
  it("requires every bit of the mask, not merely one of them", () => {
    expect(can(Role.Shopper, Permission.Read | Permission.Write)).toBe(false);
    expect(can(Role.Editor, Permission.Read | Permission.Write)).toBe(true);
  });

  it("is satisfied by any mask when nothing is required", () => {
    expect(can(Permission.None, Permission.None)).toBe(true);
  });

  it("grants nothing on an empty mask", () => {
    expect(can(Permission.None, Permission.Read)).toBe(false);
  });
});

describe("the roles", () => {
  it("lets a shopper tick items off without editing the list", () => {
    expect(can(Role.Shopper, Permission.Shop)).toBe(true);
    expect(can(Role.Shopper, Permission.Write)).toBe(false);
  });

  it("withholds sharing from an editor", () => {
    expect(can(Role.Editor, Permission.Manage)).toBe(false);
  });

  it("gives an owner every defined bit", () => {
    expect(Role.Owner).toBe(ALL_PERMISSIONS);
  });

  it("names a mask only when it matches a role exactly", () => {
    expect(roleOf(Role.Editor)).toBe("Editor");
    expect(roleOf(Permission.Write)).toBeNull();
  });

  it("covers every declared role name", () => {
    for (const name of ROLE_NAMES) expect(roleOf(Role[name])).toBe(name);
  });
});

describe("sanitizePermissions", () => {
  it("drops bits the model does not define", () => {
    expect(sanitizePermissions(ALL_PERMISSIONS | (1 << 7))).toBe(
      ALL_PERMISSIONS,
    );
  });
});

describe("describePermissions", () => {
  it("returns translation keys rather than display strings", () => {
    expect(describePermissions(Role.Shopper)).toEqual([
      "permission.read",
      "permission.shop",
    ]);
  });
});
