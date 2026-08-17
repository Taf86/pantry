/** Costanti di dominio condivise fra client e server. */

/** Validità di un token di invito. */
export const INVITE_TTL_DAYS = 7;

/** Ritenzione delle righe di deduplicazione delle mutazioni. */
export const APPLIED_MUTATION_TTL_DAYS = 30;

/** Ritenzione delle richieste di registrazione già evase. */
export const SIGNUP_REQUEST_TTL_DAYS = 30;

/**
 * Tetto alle richieste di registrazione aperte.
 *
 * È l'unica scrittura pubblica non autenticata dell'applicazione: oltre questa
 * soglia smette di accettarne, così un flusso automatico non può riempire la
 * tabella né sommergere la coda del backoffice.
 */
export const MAX_OPEN_SIGNUP_REQUESTS = 50;

/** Finestra di default per "in scadenza". */
export const DEFAULT_EXPIRING_WITHIN_DAYS = 7;

/** Massimo numero di giorni interrogabile da `pantry.expiring`. */
export const MAX_EXPIRING_WITHIN_DAYS = 365;

/** Profondità massima dell'albero di una dispensa. */
export const MAX_PANTRY_DEPTH = 12;

/** Dimensione massima di un batch di spunte inviato dalla coda offline. */
export const MAX_CHECK_BATCH = 200;

/** Vincoli di lunghezza applicati sia in input che dalla UI. */
export const MAX_NAME_LENGTH = 120;
export const MAX_UNIT_LENGTH = 20;
export const MAX_NOTE_LENGTH = 500;
export const MAX_QUANTITY = 1_000_000;
export const MAX_CONTACT_LENGTH = 200;

/** Lunghezza minima della password scelta in fase di attivazione. */
export const MIN_PASSWORD_LENGTH = 10;

/** Prefisso delle room Socket.IO. */
export const listRoom = (listId: string): string => `list:${listId}`;
export const pantryRoom = (pantryId: string): string => `pantry:${pantryId}`;

/**
 * Tassonomia di partenza, ordinata come le corsie di un supermercato:
 * è ciò che rende sensata la vista di spesa fusa fra più liste.
 */
export const DEFAULT_CATEGORIES = [
  { id: "ortofrutta", name: "Ortofrutta", sortOrder: 10 },
  { id: "panetteria", name: "Pane e panetteria", sortOrder: 20 },
  { id: "macelleria", name: "Carne e pesce", sortOrder: 30 },
  { id: "latticini", name: "Latticini e uova", sortOrder: 40 },
  { id: "gastronomia", name: "Gastronomia e salumi", sortOrder: 50 },
  { id: "dispensa", name: "Dispensa e scatolame", sortOrder: 60 },
  { id: "colazione", name: "Colazione e dolci", sortOrder: 70 },
  { id: "surgelati", name: "Surgelati", sortOrder: 80 },
  { id: "bevande", name: "Bevande", sortOrder: 90 },
  { id: "igiene", name: "Igiene e cura persona", sortOrder: 100 },
  { id: "casa", name: "Casa e pulizia", sortOrder: 110 },
  { id: "animali", name: "Animali", sortOrder: 120 },
  { id: "altro", name: "Altro", sortOrder: 999 },
] as const;

/** Categoria di ripiego per gli item senza tassonomia. */
export const FALLBACK_CATEGORY_ID = "altro";

/** Ordinamento usato per gli item privi di categoria. */
export const UNCATEGORIZED_SORT_ORDER = 1_000;
