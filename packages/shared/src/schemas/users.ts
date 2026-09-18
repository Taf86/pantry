import z from "zod";
import {
  DEFAULT_PAGINATION,
  emailSchema,
  nameSchema,
  paginationSchema,
  type Page,
} from "./common.js";
import { MAX_CONTACT_LENGTH, MAX_NAME_LENGTH } from "../constants.js";

export const UserRole = {
  user: "user",
  admin: "admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const UserRoles = [UserRole.user, UserRole.admin] as const;
export const userRoleSchema = z.enum(UserRole);

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
export const userStatusSchema = z.enum(UserStatus);

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

export const UserSortFields = [
  "displayName",
  "email",
  "role",
  "status",
] as const;
export type UserSortField = (typeof UserSortFields)[number];
export const userSortFieldSchema = z.enum(UserSortFields);

export const userSortSchema = z.object({
  id: userSortFieldSchema,
  desc: z.boolean(),
});
export type UserSort = z.infer<typeof userSortSchema>;

export const listUsersFiltersSchema = z.object({
  displayName: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  email: z.string().trim().min(1).max(MAX_CONTACT_LENGTH).optional(),
  role: z.array(userRoleSchema).min(1).max(UserRoles.length).optional(),
  status: z.array(userStatusSchema).min(1).max(UserStatuses.length).optional(),
});
export type ListUsersFilters = z.infer<typeof listUsersFiltersSchema>;

export const listUsersInputSchema = z.object({
  pagination: paginationSchema.default(DEFAULT_PAGINATION),
  sorting: z.array(userSortSchema).max(UserSortFields.length).default([]),
  filters: listUsersFiltersSchema.default({}),
});
export type ListUsersInput = z.infer<typeof listUsersInputSchema>;
export type ListUsersResult = Page<UserExtended>;

export const createUserInputSchema = z.object({
  email: emailSchema,
  displayName: nameSchema,
  role: userRoleSchema.default("user"),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const editUserInputSchema = z.object({
  userId: z.uuid(),
  email: emailSchema,
  displayName: nameSchema,
  role: userRoleSchema,
  status: userStatusSchema,
});
export type EditUserInput = z.infer<typeof editUserInputSchema>;

export const setUserStatusInputSchema = z.object({
  userId: z.uuid(),
  status: z.enum([UserStatus.active, UserStatus.suspended]),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusInputSchema>;

export const setUserRoleInputSchema = z.object({
  userId: z.uuid(),
  role: userRoleSchema,
});
export type SetUserRoleInput = z.infer<typeof setUserRoleInputSchema>;

export const userIdInputSchema = z.object({
  userId: z.uuid(),
});
export type UserIdInput = z.infer<typeof userIdInputSchema>;
