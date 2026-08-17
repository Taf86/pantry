/**
 * Chiavi di cache, tutte in un posto.
 *
 * Con una cache persistita su IndexedDB una chiave sbagliata non è un bug che
 * sparisce ricaricando la pagina: resta sul dispositivo. Vale la pena averle
 * centralizzate e tipizzate.
 */
export const keys = {
  me: () => ["me"] as const,
  categories: () => ["categories"] as const,

  lists: () => ["lists"] as const,
  list: (listId: string) => ["lists", listId] as const,
  listItems: (listId: string) => ["lists", listId, "items"] as const,

  pantries: () => ["pantries"] as const,
  pantry: (pantryId: string) => ["pantries", pantryId] as const,
  pantryNodes: (pantryId: string) => ["pantries", pantryId, "nodes"] as const,
  pantryMissing: (pantryId: string) =>
    ["pantries", pantryId, "missing"] as const,
  pantryExpiring: (pantryId: string, withinDays: number) =>
    ["pantries", pantryId, "expiring", withinDays] as const,

  shoppingSession: () => ["shopping", "session"] as const,

  adminUsers: () => ["admin", "users"] as const,
  adminSignupRequests: () => ["admin", "signup-requests"] as const,
  userSearch: (query: string) => ["users", "search", query] as const,
  invitePreview: (token: string) => ["invite", token] as const,
  signupInfo: () => ["signup", "info"] as const,
} as const;
