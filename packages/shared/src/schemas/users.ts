import z from "zod";
import { emailSchema, nameSchema } from "./common.js";

export const UserRole = {
  user: "user",
  admin: "admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const UserRoles = [UserRole.user, UserRole.admin] as const;

export const UserStatus = {
  unactivated: "unactivated",
  active: "active",
  suspended: "suspended",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const UserStatuses = [
  UserStatus.unactivated,
  UserStatus.active,
  UserStatus.suspended,
] as const;

export type UserRef = {
  id: string;
  email: string;
  displayName: string;
};
export type User = UserRef & {
  role: UserRole;
  status: UserStatus;
};
export type UserExtended = User & {
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
};

export const createUserInputSchema = z.object({
  email: emailSchema,
  displayName: nameSchema,
  role: z.enum(UserRole).default("user"),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const setUserStatusInputSchema = z.object({
  userId: z.uuid(),
  status: z.enum([UserStatus.active, UserStatus.suspended]),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusInputSchema>;

export const setUserRoleInputSchema = z.object({
  userId: z.uuid(),
  role: z.enum(UserRole),
});
export type SetUserRoleInput = z.infer<typeof setUserRoleInputSchema>;

export const userIdInputSchema = z.object({
  userId: z.uuid(),
});
export type UserIdInput = z.infer<typeof userIdInputSchema>;

export const userStatusSchema = z.enum(UserStatus);
export const userRoleSchema = z.enum(UserRole);
