import type { QueryClient } from "@tanstack/react-query";
import type { DeleteItemInput } from "@pantry/shared";

import { MUTATION } from "./mutations";

/**
 * Items this client has deleted but whose delete has not landed yet.
 *
 * Needed as a guard on incoming socket events. Delete a row offline, have
 * another device edit it, and let the socket reconnect before the queue
 * drains: the edit arrives as an upsert and the row you deleted comes back —
 * and stays, which reads as a broken delete button.
 */
export const pendingDeletedIds = (client: QueryClient): ReadonlySet<string> => {
  const ids = client
    .getMutationCache()
    .getAll()
    .filter(
      (mutation) =>
        mutation.options.mutationKey?.[0] === MUTATION.itemDelete &&
        mutation.state.status !== "success",
    )
    .map((mutation) => (mutation.state.variables as DeleteItemInput).id);

  return new Set(ids);
};
