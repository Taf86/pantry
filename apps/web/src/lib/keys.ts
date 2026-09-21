import type { ListInvitesInput, ListUsersInput } from "@pantry/shared";

export const keys = {
  me: () => ["me"] as const,
  // categories: () => ["categories"] as const,

  // lists: () => ["lists"] as const,
  // list: (listId: string) => ["lists", listId] as const,
  // listItems: (listId: string) => ["lists", listId, "items"] as const,

  // pantries: () => ["pantries"] as const,
  // pantry: (pantryId: string) => ["pantries", pantryId] as const,
  // pantryNodes: (pantryId: string) => ["pantries", pantryId, "nodes"] as const,
  // pantryMissing: (pantryId: string) =>
  //   ["pantries", pantryId, "missing"] as const,
  // pantryExpiring: (pantryId: string, withinDays: number) =>
  //   ["pantries", pantryId, "expiring", withinDays] as const,

  // shoppingSession: () => ["shopping", "session"] as const,

  adminUsers: () => ["admin", "users"] as const,
  adminUsersList: (input: ListUsersInput) =>
    ["admin", "users", "list", input] as const,
  adminUser: (userId: string) => ["admin", "users", userId] as const,
  adminInvites: () => ["admin", "invites"] as const,
  adminInvitesList: (input: ListInvitesInput) =>
    ["admin", "invites", "list", input] as const,
  // adminSignupRequests: () => ["admin", "signup-requests"] as const,
  // userSearch: (query: string) => ["users", "search", query] as const,
  invitePreview: (token: string) => ["invite", token] as const,
  // signupInfo: () => ["signup", "info"] as const,
} as const;
