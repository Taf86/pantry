import { randomUUID } from "node:crypto";

import {
  ConflictCode,
  SHOPPING_LEASE_TTL_MS,
  SHOPPING_SESSION_RETENTION_DAYS,
  SessionEndReason,
  serializeDates,
  type ClaimSessionInput,
  type HeartbeatInput,
  type ReleaseSessionInput,
  type ShoppingSession,
} from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";

import type { Database, Executor } from "../../db/client.js";
import { isUniqueViolation } from "../../db/errors.js";
import { shoppingSessions } from "../../db/schema/shopping-sessions.js";
import { users } from "../../db/schema/users.js";
import type { EventBus } from "../../realtime/events.js";

export interface SessionDeps {
  db: Database;
  events: EventBus;
}

type SessionRow = typeof shoppingSessions.$inferSelect;

const MS_PER_DAY = 86_400_000;
const ACTIVE_INDEX = "idx_shopping_sessions_active";

const leaseUntil = (from: Date = new Date()): Date =>
  new Date(from.getTime() + SHOPPING_LEASE_TTL_MS);

const toDto = async (
  db: Executor,
  row: SessionRow,
): Promise<ShoppingSession> => {
  const [holder] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  if (!holder) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not existing." });
  }

  return serializeDates({
    id: row.id,
    listId: row.listId,
    holder,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    endedAt: row.endedAt,
    endReason: row.endReason,
  });
};

const findActive = async (
  db: Executor,
  listId: string,
): Promise<SessionRow | null> => {
  const [row] = await db
    .select()
    .from(shoppingSessions)
    .where(
      and(
        eq(shoppingSessions.listId, listId),
        isNull(shoppingSessions.endedAt),
      ),
    )
    .limit(1);

  return row ?? null;
};

const conflict = async (
  db: Executor,
  code: ConflictCode,
  row: SessionRow | null,
): Promise<TRPCError> =>
  new TRPCError({
    code: "CONFLICT",
    message: "Someone else is doing this shopping run.",
    // The cause becomes `data.conflict` for the client, so it must be JSON
    // safe: a Date left in here would serialize inconsistently with the shared
    // schema the client parses it back with.
    cause: { code, session: row === null ? null : await toDto(db, row) },
  });

/** Who holds the lease on this list, if anybody. */
export const activeSession = async (
  db: Database,
  listId: string,
): Promise<ShoppingSession | null> => {
  const row = await findActive(db, listId);
  return row === null ? null : toDto(db, row);
};

/**
 * Takes a list in charge, or takes it over from a lease nobody renewed.
 *
 * Three layers of defence, all of them load-bearing:
 *  1. `ended_at IS NULL` on the takeover UPDATE. Under READ COMMITTED the
 *     second transaction re-evaluates the predicate once the row lock is
 *     released, and updates nothing.
 *  2. The row count of that UPDATE. Zero rows means a concurrent takeover won
 *     the race between our SELECT and our UPDATE, so we bail out rather than
 *     insert against the unique index.
 *  3. The unique violation catch, for the case where the list had no active
 *     session at all and two claims raced straight to the INSERT. There the
 *     partial index is the only arbiter, and that is by design.
 *
 * Takeover never waits for the sweeper: an expired-but-unswept session still
 * occupies the index, so this closes it itself, in the same transaction.
 */
export const claimSession = async (
  deps: SessionDeps,
  actorId: string,
  input: ClaimSessionInput,
): Promise<ShoppingSession> => {
  const now = new Date();
  const expiresAt = leaseUntil(now);
  let takenOver: string | null = null;

  const created = await deps.db
    .transaction(async (tx) => {
      const active = await findActive(tx, input.listId);

      if (active) {
        // Already mine: a claim is a renewal, not a takeover.
        if (active.userId === actorId) {
          const [renewed] = await tx
            .update(shoppingSessions)
            .set({ expiresAt })
            .where(
              and(
                eq(shoppingSessions.id, active.id),
                isNull(shoppingSessions.endedAt),
              ),
            )
            .returning();

          if (renewed) return renewed;
          throw await conflict(tx, ConflictCode.sessionHeld, null);
        }

        // Still alive and somebody else holds it.
        if (active.expiresAt.getTime() > now.getTime()) {
          throw await conflict(tx, ConflictCode.sessionHeld, active);
        }

        const closed = await tx
          .update(shoppingSessions)
          .set({ endedAt: now, endReason: SessionEndReason.taken_over })
          .where(
            and(
              eq(shoppingSessions.id, active.id),
              isNull(shoppingSessions.endedAt),
            ),
          )
          .returning({ id: shoppingSessions.id });

        if (closed.length === 0) {
          throw await conflict(tx, ConflictCode.sessionHeld, null);
        }
        takenOver = closed[0]!.id;
      }

      const [session] = await tx
        .insert(shoppingSessions)
        .values({
          id: randomUUID(),
          listId: input.listId,
          userId: actorId,
          startedAt: now,
          expiresAt,
        })
        .returning();

      if (!session) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return session;
    })
    .catch(async (error: unknown) => {
      if (isUniqueViolation(error, ACTIVE_INDEX)) {
        throw await conflict(deps.db, ConflictCode.sessionHeld, null);
      }
      throw error;
    });

  if (takenOver !== null) {
    // Ended before started: a client that applies them in order never sees two
    // people holding the same list, not even for a frame.
    deps.events.publish({
      type: "session.ended",
      listId: input.listId,
      sessionId: takenOver,
      reason: SessionEndReason.taken_over,
    });
  }

  const dto = await toDto(deps.db, created);
  deps.events.publish({
    type: "session.started",
    listId: input.listId,
    session: dto,
  });
  return dto;
};

/**
 * Renews the lease.
 *
 * Deliberately renews one whose `expires_at` has already passed, as long as
 * nobody took over: somebody who lost signal for twenty minutes in the shop
 * should get their lease back, not be told to re-claim at the till. Expiry is
 * only ever a signal to OTHER people that taking over is reasonable.
 */
export const heartbeatSession = async (
  deps: SessionDeps,
  actorId: string,
  input: HeartbeatInput,
): Promise<ShoppingSession> => {
  const [renewed] = await deps.db
    .update(shoppingSessions)
    .set({ expiresAt: leaseUntil() })
    .where(
      and(
        eq(shoppingSessions.id, input.sessionId),
        eq(shoppingSessions.listId, input.listId),
        eq(shoppingSessions.userId, actorId),
        isNull(shoppingSessions.endedAt),
      ),
    )
    .returning();

  if (!renewed) {
    throw await conflict(
      deps.db,
      ConflictCode.sessionLost,
      await findActive(deps.db, input.listId),
    );
  }
  return toDto(deps.db, renewed);
};

/**
 * Hands the list back. Idempotent, and never throws.
 *
 * It runs on `visibilitychange` and on unload, so it will fire twice; an error
 * there would surface as a scary toast at the exact moment the user is done
 * and walking away.
 */
export const releaseSession = async (
  deps: SessionDeps,
  actorId: string,
  input: ReleaseSessionInput,
): Promise<ShoppingSession | null> => {
  const [ended] = await deps.db
    .update(shoppingSessions)
    .set({
      endedAt: new Date(),
      endReason: input.completed
        ? SessionEndReason.completed
        : SessionEndReason.released,
    })
    .where(
      and(
        eq(shoppingSessions.id, input.sessionId),
        eq(shoppingSessions.listId, input.listId),
        eq(shoppingSessions.userId, actorId),
        isNull(shoppingSessions.endedAt),
      ),
    )
    .returning();

  if (!ended) return null;

  deps.events.publish({
    type: "session.ended",
    listId: input.listId,
    sessionId: ended.id,
    reason: ended.endReason ?? SessionEndReason.released,
  });
  return toDto(deps.db, ended);
};

/** Ends the session of a list being deleted, so its lease does not outlive it. */
export const endSessionsForList = async (
  tx: Executor,
  listId: string,
): Promise<void> => {
  await tx
    .update(shoppingSessions)
    .set({
      endedAt: new Date(),
      endReason: SessionEndReason.list_deleted,
    })
    .where(
      and(
        eq(shoppingSessions.listId, listId),
        isNull(shoppingSessions.endedAt),
      ),
    );
};

/**
 * Closes leases nobody has renewed for a full TTL beyond their expiry.
 *
 * Hygiene, not the mechanism that frees a lease: `claimSession` takes over the
 * moment a lease expires, and the client derives "expired" from `expires_at`
 * on its own. Sweeping at expiry instead of well after it would mean a shopper
 * who is simply offline in the shop loses their badge to a background job.
 */
export const sweepExpiredShoppingSessions = async (
  db: Database,
): Promise<number> => {
  const cutoff = new Date(Date.now() - SHOPPING_LEASE_TTL_MS);

  const swept = await db
    .update(shoppingSessions)
    .set({ endedAt: new Date(), endReason: SessionEndReason.expired })
    .where(
      and(
        isNull(shoppingSessions.endedAt),
        lt(shoppingSessions.expiresAt, cutoff),
      ),
    )
    .returning({ id: shoppingSessions.id });

  return swept.length;
};

/** Drops ended sessions past their retention. */
export const sweepEndedShoppingSessions = async (
  db: Database,
): Promise<number> => {
  const cutoff = new Date(
    Date.now() - SHOPPING_SESSION_RETENTION_DAYS * MS_PER_DAY,
  );

  const swept = await db
    .delete(shoppingSessions)
    .where(
      and(
        isNotNull(shoppingSessions.endedAt),
        lt(shoppingSessions.endedAt, cutoff),
      ),
    )
    .returning({ id: shoppingSessions.id });

  return swept.length;
};
