import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { listScope, type MutationName } from "@/lib/mutations";

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
