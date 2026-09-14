/** Domain constants shared between client and server. */

/** Lifetime of an invite token. */
export const INVITE_TTL_DAYS = 7;

/** Retention of the mutation deduplication rows. */
export const APPLIED_MUTATION_TTL_DAYS = 30;

/** Retention of signup requests that have already been decided. */
export const SIGNUP_REQUEST_TTL_DAYS = 30;

/**
 * Cap on the number of open signup requests.
 *
 * This is the application's only unauthenticated public write: past this
 * threshold it stops accepting them, so an automated flow cannot fill up the
 * table nor swamp the backoffice queue.
 */
export const MAX_OPEN_SIGNUP_REQUESTS = 50;

/** Default window for "expiring soon". */
export const DEFAULT_EXPIRING_WITHIN_DAYS = 7;

/** Maximum number of days that `pantry.expiring` can be queried for. */
export const MAX_EXPIRING_WITHIN_DAYS = 365;

/** Maximum depth of a pantry tree. */
export const MAX_PANTRY_DEPTH = 12;

/** Maximum size of a batch of checks sent by the offline queue. */
export const MAX_CHECK_BATCH = 200;

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
