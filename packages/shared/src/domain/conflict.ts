/**
 * Politiche di conflitto condivise fra client e server.
 *
 * Stanno in `shared` per una ragione precisa: l'aggiornamento ottimistico nel
 * client e la scrittura nel server devono decidere allo stesso modo, altrimenti
 * la UI mostra uno stato che il server rifiuterà.
 */

/** Codice applicativo che il server allega a un `CONFLICT` di tRPC. */
export const CONFLICT_CODE = "VERSION_CONFLICT" as const;

export interface ConflictPayload<T> {
  code: typeof CONFLICT_CODE;
  /** Stato corrente lato server: il client lo accetta e basta. */
  current: T | null;
}

export const isConflictPayload = <T>(
  value: unknown,
): value is ConflictPayload<T> =>
  typeof value === "object" &&
  value !== null &&
  (value as { code?: unknown }).code === CONFLICT_CODE;

/**
 * Last-write-wins sulla spunta.
 *
 * `incoming` è l'istante registrato dal dispositivo che ha agito, non quello
 * di arrivo al server: una spunta fatta in negozio alle 18:03 e sincronizzata
 * alle 18:40 non deve sovrascrivere una de-spunta fatta alle 18:20.
 */
export const resolveCheck = (
  currentCheckedAt: string | null,
  currentUpdatedAt: string,
  incomingAt: string,
  incomingCheckedAt: string | null,
): { apply: boolean; checkedAt: string | null } => {
  const reference = currentCheckedAt ?? currentUpdatedAt;
  if (Date.parse(incomingAt) < Date.parse(reference)) {
    return { apply: false, checkedAt: currentCheckedAt };
  }
  return { apply: true, checkedAt: incomingCheckedAt };
};
