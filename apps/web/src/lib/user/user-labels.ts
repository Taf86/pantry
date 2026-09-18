import { UserRole, UserStatus } from "@pantry/shared";

export const statusLabelKeys = {
  [UserStatus.unactivated]: "feature.users.status.unactivated",
  [UserStatus.active]: "feature.users.status.active",
  [UserStatus.suspended]: "feature.users.status.suspended",
} as const;

export const roleLabelKeys = {
  [UserRole.user]: "feature.users.role.user",
  [UserRole.admin]: "feature.users.role.admin",
} as const;
