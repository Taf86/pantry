import { appliedMutations } from "../db/schema/support.js";
import type { Executor } from "../db/client.js";

/**
 * Deduplicazione delle mutazioni offline.
 *
 * La coda del client ritenta finché il server non risponde, e la risposta può
 * benissimo perdersi *dopo* che l'operazione è stata applicata. L'inserimento
 * del `mutationId` avviene quindi nella stessa transazione dell'operazione: o
 * valgono entrambe, o nessuna delle due.
 *
 * @returns `true` se la mutazione è nuova, `false` se era già stata applicata.
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
