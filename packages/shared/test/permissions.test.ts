import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  Permission,
  Role,
  can,
  describePermissions,
  roleOf,
  sanitizePermissions,
} from "../src/permissions";

describe("can", () => {
  it("richiede tutti i bit, non almeno uno", () => {
    const granted = Permission.Read | Permission.Shop;
    expect(can(granted, Permission.Read)).toBe(true);
    expect(can(granted, Permission.Read | Permission.Shop)).toBe(true);
    expect(can(granted, Permission.Read | Permission.Write)).toBe(false);
  });

  it("è sempre vero per la maschera vuota", () => {
    expect(can(Permission.None, Permission.None)).toBe(true);
  });

  it("nega tutto a chi non ha nulla", () => {
    expect(can(Permission.None, Permission.Read)).toBe(false);
  });
});

describe("ruoli", () => {
  it("uno Shopper può spuntare ma non modificare", () => {
    expect(can(Role.Shopper, Permission.Shop)).toBe(true);
    expect(can(Role.Shopper, Permission.Write)).toBe(false);
  });

  it("un Editor non gestisce le condivisioni", () => {
    expect(can(Role.Editor, Permission.Write)).toBe(true);
    expect(can(Role.Editor, Permission.Manage)).toBe(false);
  });

  it("Owner ha tutti i bit definiti", () => {
    expect(Role.Owner).toBe(ALL_PERMISSIONS);
  });

  it("riconosce il ruolo corrispondente a una maschera", () => {
    expect(roleOf(Role.Viewer)).toBe("Viewer");
    expect(roleOf(Role.Owner)).toBe("Owner");
  });

  it("non inventa un ruolo per maschere arbitrarie", () => {
    expect(roleOf(Permission.Write)).toBeNull();
  });
});

describe("sanitizePermissions", () => {
  it("scarta i bit non definiti", () => {
    expect(sanitizePermissions(0b1111_0111)).toBe(0b0111);
  });
});

describe("describePermissions", () => {
  it("elenca i permessi concessi in ordine di bit", () => {
    expect(describePermissions(Role.Shopper)).toEqual(["lettura", "spesa"]);
  });
});
