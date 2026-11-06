import type { RoleName } from "@pantry/shared";

export const roleLabelKeys = {
  Viewer: "feature.lists.role.viewer",
  Shopper: "feature.lists.role.shopper",
  Editor: "feature.lists.role.editor",
  Owner: "feature.lists.role.manager",
} as const satisfies Record<RoleName, string>;

export const roleDescriptionKeys = {
  Viewer: "feature.lists.role.viewerDescription",
  Shopper: "feature.lists.role.shopperDescription",
  Editor: "feature.lists.role.editorDescription",
  Owner: "feature.lists.role.managerDescription",
} as const satisfies Record<RoleName, string>;
