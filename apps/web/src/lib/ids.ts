import { uuidv7 } from "pantry-shared";

/**
 * Gli ID nascono qui, nel browser, prima ancora della chiamata di rete.
 *
 * È il prerequisito dell'offline: l'item ha identità mentre sei ancora tra gli
 * scaffali senza segnale, e al ritorno della rete non serve riconciliare
 * nessun ID temporaneo.
 */
export const newId = (): string => uuidv7();

/** Ogni mutazione porta il proprio identificatore, per la deduplica server. */
export const newMutationId = (): string => uuidv7();
