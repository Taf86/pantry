import { lt } from "drizzle-orm";
// import { APPLIED_MUTATION_TTL_DAYS } from "@pantry/shared";
import type { Logger } from "pino";

import type { Database } from "../db/client.js";
import { sessions } from "../db/schema/sessions.js";
// import { appliedMutations } from "../db/schema/support.js";
// import { sweepDecidedSignupRequests } from "../services/signup.service.js";

// const MS_PER_DAY = 86_400_000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

const runCleanup = async (db: Database, logger: Logger): Promise<void> => {
  // const mutationCutoff = new Date(
  //   Date.now() - APPLIED_MUTATION_TTL_DAYS * MS_PER_DAY,
  // );

  // const staleMutations = await db
  //   .delete(appliedMutations)
  //   .where(lt(appliedMutations.appliedAt, mutationCutoff))
  //   .returning({ id: appliedMutations.id });

  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  // const decidedRequests = await sweepDecidedSignupRequests(db);

  logger.info(
    {
      // mutations: staleMutations.length,
      sessions: expiredSessions.length,
      // signupRequests: decidedRequests,
    },
    "Cleanup completed.",
  );
};

const withTimeout = async (
  promise: Promise<void>,
  ms: number,
): Promise<boolean> => {
  const timeout = new Promise<false>((resolve) => {
    setTimeout(() => resolve(false), ms).unref();
  });
  return Promise.race([promise.then(() => true), timeout]);
};

export const startCleanupJob = (
  db: Database,
  logger: Logger,
): (() => Promise<void>) => {
  let inFlight: Promise<void> | null = null;
  const tick = (): void => {
    if (inFlight !== null) {
      logger.warn("Cleanup running, tick skipped.");
      return;
    }
    inFlight = runCleanup(db, logger)
      .catch((error: unknown) => {
        logger.error({ error }, "Cleanup failed.");
      })
      .finally(() => {
        inFlight = null;
      });
  };

  tick();
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();

  return async () => {
    clearInterval(timer);
    if (inFlight === null) return;
    const completed = await withTimeout(inFlight, 5_000);
    if (!completed) {
      logger.warn("Shutdown: cleanup not completed within timeout");
    }
  };
};
