import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { listScope, type MutationName } from "@/lib/mutations";

/**
 * A mutation identified by its key alone.
 *
 * The `mutationFn`, the optimistic update and the reconciliation live in the
 * defaults registered on the QueryClient, not here. That is not laziness: a
 * mutation restored from IndexedDB after a restart no longer has the component
 * that fired it, and logic living here would be lost precisely when it is
 * needed. What the call site DOES supply is the scope, because only it knows
 * which list the write belongs to.
 */
export const useAppMutation = <TInput, TOutput = unknown>(
  key: MutationName,
  options: { listId?: string } = {},
): UseMutationResult<TOutput, unknown, TInput> =>
  useMutation<TOutput, unknown, TInput>({
    mutationKey: [key],
    ...(options.listId !== undefined && {
      scope: { id: listScope(options.listId) },
    }),
  });
