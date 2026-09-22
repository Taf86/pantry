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
 * How long a request may sit unanswered before the cleanup job rejects it.
 *
 * Without eviction the open-request cap below is a weapon: junk submissions
 * that nobody decides on hold their slots forever, and legitimate signups stay
 * refused until an admin clears the queue by hand.
 */
export const REQUEST_PENDING_TTL_DAYS = 14;

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

/**
 * Cap on the procedure calls a single batched tRPC request may carry.
 *
 * tRPC leaves this unlimited on its own. Fastify's `maxParamLength` of 100
 * happens to bound it too — the batch travels in a single route parameter, so
 * roughly nine short procedure names fit and four long ones — but that is an
 * accident of naming, not a limit anyone chose: rename a procedure and it
 * moves. Eight is under the URL ceiling for the shortest names and far above
 * what a page load asks for, so the explicit number is the one that governs.
 */
export const MAX_TRPC_BATCH_SIZE = 8;

/** Rate limits on the unauthenticated surface, keyed by client IP. */
export const PUBLIC_RATE_LIMITS = {
  /** Blanket HTTP budget: there to stop a runaway script, not to shape traffic. */
  http: { windowMs: 60_000, max: 300 },
  /** Any public tRPC procedure. */
  procedure: { windowMs: 60_000, max: 60 },
  /** The only unauthenticated write, in three widening windows. */
  createRequest: [
    { windowMs: 30_000, max: 1 },
    { windowMs: 3_600_000, max: 5 },
    { windowMs: 86_400_000, max: 15 },
  ],
  /** Admission rate across every source, the floor that bounds push volume. */
  createRequestGlobal: { windowMs: 3_600_000, max: 20 },
} as const;

/**
 * Open requests a single client IP may hold at once.
 *
 * MAX_OPEN_REQUESTS is global, so without this an attacker fills every slot
 * from one loop. At three per address it takes seventeen distinct IPs, and the
 * hourly admission rate above makes even that take most of a day.
 */
export const MAX_OPEN_REQUESTS_PER_IP = 3;

/** Devices a single user may keep subscribed to push notifications. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 5;

/** Retention of push subscriptions nothing has confirmed for this long. */
export const PUSH_SUBSCRIPTION_TTL_DAYS = 90;

/**
 * The admin notifier coalesces: the first request after an idle spell goes out
 * at once, anything inside the cooldown is folded into a single later send,
 * and an hourly ceiling bounds what an anonymous caller can make a phone do.
 */
export const PUSH_NOTIFIER = {
  cooldownMs: 10 * 60_000,
  maxPerHour: 6,
} as const;

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
