/**
 * Bitmask permission model, applied identically to lists and (later) pantries.
 *
 * `Shop` is deliberately separate from `Write`: a person can tick products off
 * while shopping without being able to alter the list. It is the distinction
 * that makes it sensible to share a list with someone you only ask to shop.
 */
export const Permission = {
  None: 0,
  /** Sees the contents. */
  Read: 1 << 0,
  /** Adds, edits, removes. */
  Write: 1 << 1,
  /** Ticks off as bought / consumes from the pantry. */
  Shop: 1 << 2,
  /** Manages the sharing. */
  Manage: 1 << 3,
} as const;

export type PermissionFlag = (typeof Permission)[keyof typeof Permission];

/** Mask carrying every defined bit: used to validate input. */
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

/**
 * Translation keys, not labels.
 *
 * Shared code never carries display strings: the taxonomy of roles belongs to
 * the domain, the wording belongs to the locale files.
 */
export const ROLE_LABEL_KEYS: Record<RoleName, string> = {
  Viewer: "role.viewer",
  Shopper: "role.shopper",
  Editor: "role.editor",
  Owner: "role.owner",
};

/** Translation key per flag, in bit order. */
export const PERMISSION_LABEL_KEYS: ReadonlyArray<readonly [number, string]> = [
  [Permission.Read, "permission.read"],
  [Permission.Write, "permission.write"],
  [Permission.Shop, "permission.shop"],
  [Permission.Manage, "permission.manage"],
];

/** `true` when `granted` carries *every* bit of `required`. */
export const can = (granted: number, required: number): boolean =>
  (granted & required) === required;

/**
 * The role a mask corresponds to exactly, if any.
 *
 * Arbitrary masks stay legitimate: the UI names a role only when the match is
 * clean, and falls back to listing the individual grants otherwise.
 */
export const roleOf = (permissions: number): RoleName | null =>
  ROLE_NAMES.find((name) => Role[name] === permissions) ?? null;

/** Normalizes a mask by dropping undefined bits. */
export const sanitizePermissions = (permissions: number): number =>
  permissions & ALL_PERMISSIONS;

/** Translation keys of the granted permissions, in bit order. */
export const describePermissions = (permissions: number): string[] =>
  PERMISSION_LABEL_KEYS.filter(([flag]) => can(permissions, flag)).map(
    ([, key]) => key,
  );
