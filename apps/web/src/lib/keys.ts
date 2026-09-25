import type {
  ListInvitesInput,
  ListRequestsInput,
  ListUsersInput,
} from "@pantry/shared";

/**
 * Query keys, in one place.
 *
 * These are persisted to IndexedDB, so a key is a durable contract: a cache
 * written by yesterday's build is rehydrated by today's.
 *
 * Note the deliberate split between `lists()` and `list(id)`. The index and a
 * single list are separate roots — ["lists"] is NOT a prefix of ["list", id] —
 * so invalidating the index after a rename cannot drag every list's items and
 * catalogue down with it. Within one list the nesting IS a prefix, which is
 * what makes "forget everything about this list" a single call.
 */
export const keys = {
  me: () => ["me"] as const,
  categories: () => ["categories"] as const,

  /** The index: summaries of every list the user belongs to. */
  lists: () => ["lists"] as const,

  list: (listId: string) => ["list", listId] as const,
  listItems: (listId: string) => ["list", listId, "items"] as const,
  catalog: (listId: string) => ["list", listId, "catalog"] as const,
  claim: (listId: string) => ["list", listId, "claim"] as const,

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
