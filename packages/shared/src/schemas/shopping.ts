import z from "zod";

import { entityIdSchema, isoDateTimeSchema, userIdSchema } from "./common.js";
import { userRefSchema } from "./users.js";

export const SessionEndReason = {
  released: "released",
  completed: "completed",
  taken_over: "taken_over",
  expired: "expired",
  list_deleted: "list_deleted",
} as const;
export type SessionEndReason =
  (typeof SessionEndReason)[keyof typeof SessionEndReason];
export const SessionEndReasons = [
  SessionEndReason.released,
  SessionEndReason.completed,
  SessionEndReason.taken_over,
  SessionEndReason.expired,
  SessionEndReason.list_deleted,
] as const;

/**
 * Taking a list in charge: an advisory lease over "who is at the supermarket".
 *
 * Exclusivity is real and enforced by a partial unique index in Postgres, not
 * by application code. What the lease deliberately does NOT do is authorize
 * anything: `Permission.Shop` alone allows checking items off. If the lease
 * gated checks, a shopper whose lease expired while they were offline in the
 * shop would have their entire queue rejected on the way home — the worst
 * possible failure at the worst possible moment.
 */
export const shoppingSessionSchema = z.object({
  id: entityIdSchema,
  listId: entityIdSchema,
  holder: userRefSchema,
  startedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  endReason: z.enum(SessionEndReasons).nullable(),
});
export type ShoppingSession = z.infer<typeof shoppingSessionSchema>;

/**
 * These three are online-only and therefore carry no `mutationEnvelope`:
 * agreeing on who holds a lease is a consensus question, and a claim that sat
 * in the offline queue would fire from the car park an hour later and take the
 * lease from whoever holds it by then.
 */
export const claimSessionInputSchema = z.object({ listId: entityIdSchema });
export type ClaimSessionInput = z.infer<typeof claimSessionInputSchema>;

export const heartbeatInputSchema = z.object({
  listId: entityIdSchema,
  sessionId: entityIdSchema,
});
export type HeartbeatInput = z.infer<typeof heartbeatInputSchema>;

export const releaseSessionInputSchema = z.object({
  listId: entityIdSchema,
  sessionId: entityIdSchema,
  /** Distinguishes "shopping done" from "never mind". */
  completed: z.boolean().default(false),
});
export type ReleaseSessionInput = z.infer<typeof releaseSessionInputSchema>;

export const ConflictCode = {
  sessionHeld: "session_held",
  sessionLost: "session_lost",
} as const;
export type ConflictCode = (typeof ConflictCode)[keyof typeof ConflictCode];

/** Travels in `error.data.conflict`, so the UI can name the holder. */
export const sessionConflictSchema = z.object({
  code: z.enum([ConflictCode.sessionHeld, ConflictCode.sessionLost]),
  session: shoppingSessionSchema.nullable(),
});
export type SessionConflict = z.infer<typeof sessionConflictSchema>;

export const isSessionConflict = (value: unknown): value is SessionConflict =>
  sessionConflictSchema.safeParse(value).success;

/**
 * How a list's lease looks to a given viewer.
 *
 * `mineExpired` is not an error state: the holder's queued checks are safe
 * regardless, and the copy has to say so rather than look like a failure.
 */
export const ClaimState = {
  free: "free",
  mine: "mine",
  mineExpired: "mine-expired",
  other: "other",
  otherExpired: "other-expired",
} as const;
export type ClaimState = (typeof ClaimState)[keyof typeof ClaimState];

export const claimState = (
  session: Pick<ShoppingSession, "holder" | "expiresAt" | "endedAt"> | null,
  viewerId: string,
  now: number = Date.now(),
): ClaimState => {
  if (session === null || session.endedAt !== null) return ClaimState.free;

  const expired = Date.parse(session.expiresAt) <= now;
  if (session.holder.id === viewerId) {
    return expired ? ClaimState.mineExpired : ClaimState.mine;
  }
  return expired ? ClaimState.otherExpired : ClaimState.other;
};

export const shoppingClaimSchema = z.object({
  listId: entityIdSchema,
  session: shoppingSessionSchema.nullable(),
});
export type ShoppingClaim = z.infer<typeof shoppingClaimSchema>;

export const sessionForListSchema = z.object({
  listId: entityIdSchema,
  holderId: userIdSchema.nullable(),
});
