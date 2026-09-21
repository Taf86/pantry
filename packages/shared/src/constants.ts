/** Domain constants shared between client and server. */

/** Lifetime of an invite token. */
export const INVITE_TTL_DAYS = 7;

/**
 * Retention of invites that have been spent, counted from the moment they were
 * used or expired. Until then they stay in the backoffice list as a record of
 * who was invited by whom.
 */
export const INVITE_RETENTION_DAYS = 30;

/** Retention of the mutation deduplication rows. */
export const APPLIED_MUTATION_TTL_DAYS = 30;

/** Retention of requests that have already been decided. */
export const REQUEST_RETENTION_DAYS = 30;

/**
 * Cap on the number of open requests.
 *
 * This is the application's only unauthenticated public write: past this
 * threshold it stops accepting them, so an automated flow cannot fill up the
 * table nor swamp the backoffice queue.
 */
export const MAX_OPEN_REQUESTS = 50;

/** Default window for "expiring soon". */
export const DEFAULT_EXPIRING_WITHIN_DAYS = 7;

/** Maximum number of days that `pantry.expiring` can be queried for. */
export const MAX_EXPIRING_WITHIN_DAYS = 365;

/** Maximum depth of a pantry tree. */
export const MAX_PANTRY_DEPTH = 12;

/** Maximum size of a batch of checks sent by the offline queue. */
export const MAX_CHECK_BATCH = 200;

/** Page size a paginated list falls back to when the client omits one. */
export const DEFAULT_PAGE_SIZE = 20;

/** Cap on the rows a single page may ask for. */
export const MAX_PAGE_SIZE = 100;

/** Page sizes the data table offers. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/** Length limits enforced both on input and by the UI. */
export const MAX_NAME_LENGTH = 120;
export const MAX_UNIT_LENGTH = 20;
export const MAX_NOTE_LENGTH = 500;
export const MAX_QUANTITY = 1_000_000;
export const MAX_CONTACT_LENGTH = 200;

/** Minimum length of the password chosen during activation. */
export const MIN_PASSWORD_LENGTH = 10;

/** Prefix of the Socket.IO rooms. */
export const listRoom = (listId: string): string => `list:${listId}`;
export const pantryRoom = (pantryId: string): string => `pantry:${pantryId}`;
