/**
 * Superficie pubblica del pacchetto: solo il tipo del router.
 *
 * È l'unica cosa che il client importa dal server. Nessun codice attraversa
 * il confine — solo i tipi, che spariscono in compilazione.
 */
export type { AppRouter } from "./trpc/routers/index.js";
