import type {
  ListInvitesInput,
  ListRequestsInput,
  ListUsersInput,
} from "@pantry/shared";

export const keys = {
  me: () => ["me"] as const,
  lists: () => ["lists"] as const,
  adminUsers: () => ["admin", "users"] as const,
  adminUsersList: (input: ListUsersInput) =>
    ["admin", "users", "list", input] as const,
  adminUser: (userId: string) => ["admin", "users", userId] as const,
  adminInvites: () => ["admin", "invites"] as const,
  adminInvitesList: (input: ListInvitesInput) =>
    ["admin", "invites", "list", input] as const,
  adminRequests: () => ["admin", "requests"] as const,
  adminRequestsList: (input: ListRequestsInput) =>
    ["admin", "requests", "list", input] as const,
  invitePreview: (token: string) => ["invite", token] as const,
  pushConfig: () => ["push", "config"] as const,
} as const;
