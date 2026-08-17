import { lt } from "drizzle-orm";
import { APPLIED_MUTATION_TTL_DAYS } from "pantry-shared";
import type { Logger } from "pino";

import type { Database } from "../db/client.js";
import { sessions } from "../db/schema/auth.js";
import { appliedMutations } from "../db/schema/support.js";
import { sweepDecidedSignupRequests } from "../services/signup.service.js";

const MS_PER_DAY = 86_400_000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Manutenzione periodica.
 *
 * Non serve pg_boss: con un processo solo, un `setInterval` all'avvio fa
 * esattamente lo stesso lavoro e non aggiunge né una dipendenza né tabelle.
 */
export const runCleanup = async (
  db: Database,
  logger: Logger,
): Promise<void> => {
  const mutationCutoff = new Date(
    Date.now() - APPLIED_MUTATION_TTL_DAYS * MS_PER_DAY,
  );

  const staleMutations = await db
    .delete(appliedMutations)
    .where(lt(appliedMutations.appliedAt, mutationCutoff))
    .returning({ id: appliedMutations.id });

  // Le sessioni scadute non autorizzano più nulla, ma occupano spazio e
  // sporcano il calcolo dell'ultimo accesso nel backoffice.
  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  // Le richieste di registrazione già evase sono storico, e lo storico di una
  // coda non serve a nessuno dopo un mese.
  const decidedRequests = await sweepDecidedSignupRequests(db);

  logger.info(
    {
      mutations: staleMutations.length,
      sessions: expiredSessions.length,
      signupRequests: decidedRequests,
    },
    "pulizia periodica completata",
  );
};

export const startCleanupJob = (db: Database, logger: Logger): (() => void) => {
  const tick = (): void => {
    void runCleanup(db, logger).catch((error: unknown) => {
      logger.error({ error }, "pulizia periodica fallita");
    });
  };

  tick();
  const timer = setInterval(tick, INTERVAL_MS);
  // Il job non deve tenere vivo il processo durante uno spegnimento.
  timer.unref();

  return () => clearInterval(timer);
};
