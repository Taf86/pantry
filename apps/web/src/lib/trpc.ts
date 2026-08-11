import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "pantry-api";

/**
 * Client tRPC "nudo", senza il binding a React Query.
 *
 * È deliberato: la coda offline richiede che ogni mutazione abbia una chiave
 * stabile e una `mutationFn` registrata su `setMutationDefaults`, altrimenti
 * una mutazione ripristinata da IndexedDB non saprebbe cosa eseguire. Con i
 * proxy generati automaticamente quel controllo non ce l'avremmo.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      // Il cookie di sessione viaggia da solo: stessa origin, niente header.
      fetch: (input, init) =>
        fetch(input, { ...init, credentials: "include" } as RequestInit),
    }),
  ],
});

export type ApiError = TRPCClientError<AppRouter>;

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof TRPCClientError;

/** Codice tRPC dell'errore, se l'errore viene dal server. */
export const errorCode = (error: unknown): string | null =>
  isApiError(error) ? (error.data?.code ?? null) : null;

/**
 * Un errore vale la pena ritentarlo solo se è transitorio.
 *
 * Un 4xx non cambia esito ritentando, e una coda offline che ritenta un
 * `FORBIDDEN` all'infinito non si svuota mai più.
 */
export const isRetriable = (error: unknown): boolean => {
  const code = errorCode(error);
  if (code === null) return true; // errore di rete: è esattamente il caso da ritentare
  return code === "INTERNAL_SERVER_ERROR" || code === "TIMEOUT";
};

export const errorMessage = (error: unknown): string => {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "Errore imprevisto";
};
