export const Permission = {
  Read: 1 << 0,
  Write: 1 << 1,
  Shop: 1 << 2,
  Manage: 1 << 3,
} as const;

export const ALL_PERMISSIONS =
  Permission.Read | Permission.Write | Permission.Shop | Permission.Manage;

export const Role = {
  Viewer: Permission.Read,
  Shopper: Permission.Read | Permission.Shop,
  Editor: Permission.Read | Permission.Write | Permission.Shop,
  Owner:
    Permission.Read | Permission.Write | Permission.Shop | Permission.Manage,
} as const;

export type RoleName = keyof typeof Role;

export const ROLE_NAMES = ["Viewer", "Shopper", "Editor", "Owner"] as const;

export const ROLE_LABEL_KEYS: Record<RoleName, string> = {
  Viewer: "role.viewer",
  Shopper: "role.shopper",
  Editor: "role.editor",
  Owner: "role.owner",
};

export const PERMISSION_LABEL_KEYS: ReadonlyArray<readonly [number, string]> = [
  [Permission.Read, "permission.read"],
  [Permission.Write, "permission.write"],
  [Permission.Shop, "permission.shop"],
  [Permission.Manage, "permission.manage"],
];

export const can = (
  granted: number | undefined | null,
  required: number,
): boolean => ((granted ?? 0) & required) === required;

export const roleOf = (permissions: number): RoleName | null =>
  ROLE_NAMES.find((name) => Role[name] === permissions) ?? null;

export const sanitizePermissions = (permissions: number): number =>
  permissions & ALL_PERMISSIONS;

export const describePermissions = (permissions: number): string[] =>
  PERMISSION_LABEL_KEYS.filter(([flag]) => can(permissions, flag)).map(
    ([, key]) => key,
  );
