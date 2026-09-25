import { lt } from "drizzle-orm";
import type { Logger } from "pino";

import type { Database } from "../db/client.js";
import { sessions } from "../db/schema/sessions.js";
import { sweepStaleInvites } from "../services/admin/invites.service.js";
import { sweepAppliedMutations } from "../services/lists/mutations.js";
import {
  sweepDecidedRequests,
  sweepStalePendingRequests,
} from "../services/admin/requests.service.js";
import { sweepStalePushSubscriptions } from "../services/push/push.service.js";

const INTERVAL_MS = 6 * 60 * 60 * 1000;

const runCleanup = async (db: Database, logger: Logger): Promise<void> => {
  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  const staleInvites = await sweepStaleInvites(db);

  const expiredRequests = await sweepStalePendingRequests(db);
  const decidedRequests = await sweepDecidedRequests(db);

  const stalePushSubscriptions = await sweepStalePushSubscriptions(db);

  const staleMutations = await sweepAppliedMutations(db);

  logger.info(
    {
      mutations: staleMutations,
      sessions: expiredSessions.length,
      invites: staleInvites,
      requests: decidedRequests,
      expiredRequests,
      pushSubscriptions: stalePushSubscriptions,
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
