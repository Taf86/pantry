import { lt } from "drizzle-orm";
import { APPLIED_MUTATION_TTL_DAYS } from "@pantry/shared";

import type { Database, Executor } from "../../db/client.js";
import { appliedMutations } from "../../db/schema/applied-mutations.js";

const MS_PER_DAY = 86_400_000;

/**
 * Deduplicates an offline mutation.
 *
 * The client queue retries until the server answers, and the answer can
 * perfectly well be lost AFTER the operation was applied. Claiming the id
 * happens inside the same transaction as the operation itself: either both
 * hold, or neither does. Call it as the first statement in the transaction.
 *
 * @returns `true` when the mutation is new, `false` when it was already applied.
 */
export const claimMutation = async (
  tx: Executor,
  mutationId: string,
  userId: string,
): Promise<boolean> => {
  const claimed = await tx
    .insert(appliedMutations)
    .values({ id: mutationId, userId })
    .onConflictDoNothing()
    .returning({ id: appliedMutations.id });

  return claimed.length > 0;
};

/**
 * Drops deduplication rows past their retention.
 *
 * A device offline for longer than the retention will replay swept mutations.
 * The design survives it: an add hits the primary key, an update or a tick is
 * idempotent under last-write-wins with the same timestamp, and only the
 * catalogue counters double-count — a statistic, not a fact.
 */
export const sweepAppliedMutations = async (db: Database): Promise<number> => {
  const cutoff = new Date(Date.now() - APPLIED_MUTATION_TTL_DAYS * MS_PER_DAY);

  const swept = await db
    .delete(appliedMutations)
    .where(lt(appliedMutations.appliedAt, cutoff))
    .returning({ id: appliedMutations.id });

  return swept.length;
};
