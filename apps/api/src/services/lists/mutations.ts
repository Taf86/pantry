import { lt } from "drizzle-orm";
import { APPLIED_MUTATION_TTL_DAYS } from "@pantry/shared";

import type { Database, Executor } from "../../db/client.js";
import { appliedMutations } from "../../db/schema/applied-mutations.js";

const MS_PER_DAY = 86_400_000;

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

export const sweepAppliedMutations = async (db: Database): Promise<number> => {
  const cutoff = new Date(Date.now() - APPLIED_MUTATION_TTL_DAYS * MS_PER_DAY);

  const swept = await db
    .delete(appliedMutations)
    .where(lt(appliedMutations.appliedAt, cutoff))
    .returning({ id: appliedMutations.id });

  return swept.length;
};
