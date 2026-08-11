import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import type { MutationName } from "../lib/mutations";

/**
 * Mutazione identificata dalla sola chiave.
 *
 * `mutationFn`, aggiornamento ottimistico e riconciliazione vivono nei default
 * registrati su `QueryClient`. Non è pigrizia: una mutazione ripristinata da
 * IndexedDB dopo un riavvio non ha più il componente che l'ha lanciata, e se
 * quella logica stesse qui andrebbe perduta esattamente quando serve.
 */
export const useAppMutation = <TInput, TOutput = unknown>(
  key: MutationName,
): UseMutationResult<TOutput, unknown, TInput> =>
  useMutation<TOutput, unknown, TInput>({ mutationKey: [key] });
