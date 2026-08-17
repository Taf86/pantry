export const UserRole = {
  user: "user",
  admin: "admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const UserRoles = [UserRole.user, UserRole.admin] as const;

export const UserStatus = {
  invited: "invited",
  active: "active",
  suspended: "suspended",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const UserStatuses = [
  UserStatus.invited,
  UserStatus.active,
  UserStatus.suspended,
] as const;
