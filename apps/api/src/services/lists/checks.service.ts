import {
  WriteOutcome,
  type CheckItemInput,
  type CheckManyInput,
  type ItemWriteResult,
  type ListItem,
  type UncheckItemInput,
} from "@pantry/shared";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

import type { Executor } from "../../db/client.js";
import { listItems } from "../../db/schema/list-items.js";
import { shoppingSessions } from "../../db/schema/shopping-sessions.js";
import { clampToNow } from "./clock.js";
import { requireItem, toListItem, type ItemDeps } from "./items.service.js";
import { claimMutation } from "./mutations.js";

/**
 * Which shopping run covered a given instant on this list.
 *
 * Resolved by WHEN the device recorded the tick, not by whatever session
 * happens to be open at sync time. A run taken over while the shopper was
 * offline would otherwise attribute their ticks to whoever took it, and the
 * pantry bridge would then move things into the cupboard that the taker never
 * bought.
 *
 * Resolving to null is perfectly legal: this is a stamp, never a guard.
 */
const resolveCheckedIn = async (
  tx: Executor,
  listId: string,
  at: Date,
): Promise<string | null> => {
  const [row] = await tx
    .select({ id: shoppingSessions.id })
    .from(shoppingSessions)
    .where(
      and(
        eq(shoppingSessions.listId, listId),
        lte(shoppingSessions.startedAt, at),
        // Typed comparison, not a raw fragment: drizzle binds the Date
        // through the column mapper, which a hand-written sql`` does not.
        or(isNull(shoppingSessions.endedAt), gt(shoppingSessions.endedAt, at)),
      ),
    )
    .orderBy(desc(shoppingSessions.startedAt))
    .limit(1);

  return row?.id ?? null;
};

export interface CheckArgs {
  listId: string;
  id: string;
  /** `null` means unticking. */
  checkedAt: Date | null;
  /** The device instant, already clamped. The pivot. */
  at: Date;
}

/**
 * Applies one tick or untick, last-write-wins on its own clock.
 *
 * `check_updated_at` exists precisely so this can happen: `checked_at` cannot
 * be its own pivot, because unticking sets it to null and leaves a late tick
 * nothing to lose to.
 *
 * It never touches `content_updated_at`. A shopper's queue flushing at 18:40
 * carries ticks that are legitimately old; their view of the item's NAME is
 * not, and must not clobber a rename made at home at 18:20.
 */
export const applyCheck = async (
  tx: Executor,
  actorId: string,
  args: CheckArgs,
  now: Date,
): Promise<typeof listItems.$inferSelect | null> => {
  const checkedIn =
    args.checkedAt === null
      ? null
      : await resolveCheckedIn(tx, args.listId, args.at);

  const [updated] = await tx
    .update(listItems)
    .set({
      checkedAt: args.checkedAt,
      checkedBy: args.checkedAt === null ? null : actorId,
      checkedIn,
      checkUpdatedAt: args.at,
      updatedAt: now,
    })
    .where(
      and(
        eq(listItems.id, args.id),
        eq(listItems.listId, args.listId),
        isNull(listItems.deletedAt),
        lte(listItems.checkUpdatedAt, args.at),
      ),
    )
    .returning();

  return updated ?? null;
};

const single = async (
  deps: ItemDeps,
  actorId: string,
  mutationId: string,
  args: Omit<CheckArgs, "at"> & { at: Date },
): Promise<ItemWriteResult> => {
  const now = new Date();
  const at = clampToNow(args.at, now);

  const outcome = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, mutationId, actorId))) {
      return {
        outcome: WriteOutcome.deduplicated,
        row: await requireItem(tx, args.listId, args.id),
      };
    }

    const applied = await applyCheck(
      tx,
      actorId,
      { ...args, at, checkedAt: args.checkedAt },
      now,
    );

    return applied === null
      ? {
          outcome: WriteOutcome.stale,
          row: await requireItem(tx, args.listId, args.id),
        }
      : { outcome: WriteOutcome.applied, row: applied };
  });

  if (outcome.outcome === WriteOutcome.applied) {
    deps.events.publish({
      type: "item.upserted",
      listId: args.listId,
      item: toListItem(outcome.row),
    });
  }

  return {
    outcome: outcome.outcome,
    item: toListItem(outcome.row),
    serverTime: now.toISOString(),
  };
};

export const checkItem = (
  deps: ItemDeps,
  actorId: string,
  input: CheckItemInput,
): Promise<ItemWriteResult> => {
  const at = new Date(input.checkedAt);
  return single(deps, actorId, input.mutationId, {
    listId: input.listId,
    id: input.id,
    checkedAt: at,
    at,
  });
};

export const uncheckItem = (
  deps: ItemDeps,
  actorId: string,
  input: UncheckItemInput,
): Promise<ItemWriteResult> =>
  single(deps, actorId, input.mutationId, {
    listId: input.listId,
    id: input.id,
    checkedAt: null,
    at: new Date(input.at),
  });

export interface CheckManyResult {
  applied: ListItem[];
  serverTime: string;
}

/**
 * Drains a queue of ticks in one round trip and one transaction.
 *
 * The whole batch shares a single mutation id, so a retry cannot half-apply
 * it. Rows that lose their last-write-wins comparison are simply skipped —
 * silently, as everywhere else, because the client adopts what comes back.
 */
export const checkMany = async (
  deps: ItemDeps,
  actorId: string,
  input: CheckManyInput,
): Promise<CheckManyResult> => {
  const now = new Date();

  const applied = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) return [];

    const written: Array<typeof listItems.$inferSelect> = [];
    for (const check of input.checks) {
      const row = await applyCheck(
        tx,
        actorId,
        {
          listId: check.listId,
          id: check.id,
          checkedAt:
            check.checkedAt === null ? null : new Date(check.checkedAt),
          at: clampToNow(new Date(check.at), now),
        },
        now,
      );
      if (row) written.push(row);
    }
    return written;
  });

  const items = applied.map(toListItem);
  for (const item of items) {
    deps.events.publish({
      type: "item.upserted",
      listId: item.listId,
      item,
    });
  }

  return { applied: items, serverTime: now.toISOString() };
};
