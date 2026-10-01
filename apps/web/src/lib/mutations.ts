import type { QueryClient } from "@tanstack/react-query";
import { onlineManager } from "@tanstack/react-query";
import type {
  AddItemInput,
  CheckItemInput,
  CreateListInput,
  DeleteItemInput,
  DeleteListInput,
  ItemWriteResult,
  LeaveListInput,
  ListDetail,
  ListItem,
  ListMember,
  ListSummary,
  RemoveMemberInput,
  SetMemberInput,
  ShoppingSession,
  UncheckItemInput,
  UpdateItemInput,
  UpdateListInput,
  User,
} from "@pantry/shared";
import type {
  ClaimSessionInput,
  HeartbeatInput,
  ReleaseSessionInput,
} from "@pantry/shared";
import { Role } from "@pantry/shared";
import i18n from "i18next";

import { toast } from "@/components/ui/toast";
import {
  findListItem,
  findListSummary,
  removeListItem,
  removeListSummary,
  renameList,
  setListClaim,
  upsertListItem,
  upsertListSummary,
} from "./cache";
import { recordServerTime } from "./clock";
import { keys } from "./keys";
import { isApiError, isRetriable, trpc } from "./trpc";

/**
 * Mutation keys are a durable contract.
 *
 * A mutation paused while offline survives a restart in IndexedDB. On the way
 * back TanStack resumes it by looking up the `mutationFn` registered for its
 * key: renaming a key abandons the mutations already queued on people's
 * devices. Keys are added, never renamed.
 */
export const MUTATION = {
  listCreate: "lists.create",
  listUpdate: "lists.update",
  listDelete: "lists.delete",
  listMemberSet: "lists.members.set",
  listMemberRemove: "lists.members.remove",
  listLeave: "lists.members.leave",

  itemAdd: "items.add",
  itemUpdate: "items.update",
  itemCheck: "items.check",
  itemUncheck: "items.uncheck",
  itemDelete: "items.delete",

  shoppingClaim: "shopping.claim",
  shoppingRelease: "shopping.release",
  shoppingHeartbeat: "shopping.heartbeat",
} as const;

export type MutationName = (typeof MUTATION)[keyof typeof MUTATION];

/**
 * The mutations allowed to wait in IndexedDB for the network to come back.
 *
 * Everything else is online-only, and deliberately so. Agreeing on who holds a
 * shopping lease is a consensus question: a claim that sat in the queue would
 * fire from the car park an hour later and take the list from whoever holds it
 * by then. Adding a member needs a user id that only a search can produce.
 */
export const QUEUEABLE: ReadonlySet<string> = new Set<string>([
  MUTATION.listCreate,
  MUTATION.listUpdate,
  MUTATION.listDelete,
  MUTATION.itemAdd,
  MUTATION.itemUpdate,
  MUTATION.itemCheck,
  MUTATION.itemUncheck,
  MUTATION.itemDelete,
]);

export const isQueueable = (mutationKey: unknown): boolean =>
  Array.isArray(mutationKey) &&
  typeof mutationKey[0] === "string" &&
  QUEUEABLE.has(mutationKey[0]);

/**
 * Serialises every write to one list, so the queue drains in the order it was
 * filled. Without it `resumePausedMutations` fires everything at once, and an
 * add and a tick on the same row can reach the server in either order — the
 * tick losing to a NOT_FOUND for a row that is about to exist.
 */
export const listScope = (listId: string): string => `list:${listId}`;

/** Refused before it reaches the network, so it cannot be paused and queued. */
export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

export const isOfflineError = (error: unknown): error is OfflineError =>
  error instanceof OfflineError;

const requireOnline = (): void => {
  if (!onlineManager.isOnline()) throw new OfflineError();
};

const describeError = (error: unknown): string => {
  if (isOfflineError(error)) return i18n.t("feature.sync.needsNetwork");
  switch (isApiError(error) ? error.data?.code : undefined) {
    case "FORBIDDEN":
      return i18n.t("error.forbidden");
    case "BAD_REQUEST":
      return i18n.t("error.notAllowed");
    case "NOT_FOUND":
      return i18n.t("error.notFound");
    default:
      return i18n.t("error.unknown");
  }
};

const report = (error: unknown): void => {
  toast.add({ type: "error", description: describeError(error) });
};

/** Retrying a FORBIDDEN never changes its mind, and the queue stops draining. */
const retry = (failureCount: number, error: unknown): boolean =>
  isRetriable(error) && failureCount < 8;

const retryDelay = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 30_000);

interface ItemSnapshot {
  previous: ListItem | undefined;
}

/**
 * Registers every `mutationFn` and its cache rules on the QueryClient.
 *
 * All of it lives here rather than in components, for one precise reason: a
 * mutation restored from IndexedDB after a restart no longer has the component
 * that fired it. If `onSuccess` lived there, the reconciliation on the way back
 * would never happen — exactly when it matters most.
 */
export const registerMutationDefaults = (client: QueryClient): void => {
  const invalidateIndex = () =>
    void client.invalidateQueries({ queryKey: keys.lists(), exact: true });

  const adopt = (listId: string, written: ItemWriteResult): void => {
    recordServerTime(written.serverTime);
    upsertListItem(client, listId, written.item);
  };

  const rollback = (listId: string, context: unknown): void => {
    const snapshot = context as ItemSnapshot | undefined;
    if (snapshot?.previous) upsertListItem(client, listId, snapshot.previous);
  };

  const meId = (): string | null =>
    client.getQueryData<User | null>(keys.me())?.id ?? null;

  // ------------------------------------------------------------------ lists

  // Creating and renaming are queueable, so they show up at once: a list
  // created in a dead spot would otherwise exist nowhere on screen until the
  // queue drained, and the user would create it a second time.
  client.setMutationDefaults([MUTATION.listCreate], {
    mutationFn: (input: CreateListInput) => trpc.lists.create.mutate(input),
    onMutate: (input: CreateListInput) => {
      const me = client.getQueryData<User | null>(keys.me()) ?? null;
      upsertListSummary(client, {
        id: input.id,
        name: input.name,
        createdBy: me?.id ?? null,
        creatorName: me?.displayName ?? null,
        permissions: Role.Owner,
        memberCount: 1,
        openItemCount: 0,
      });
    },
    onSuccess: (created: ListSummary) => upsertListSummary(client, created),
    onError: (error: unknown, input: CreateListInput) => {
      removeListSummary(client, input.id);
      report(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.listUpdate], {
    mutationFn: (input: UpdateListInput) => trpc.lists.update.mutate(input),
    onMutate: (input: UpdateListInput) => {
      const previous = findListSummary(client, input.listId)?.name;
      renameList(client, input.listId, input.name);
      return { previous };
    },
    onSuccess: (_data, input: UpdateListInput) => {
      invalidateIndex();
      void client.invalidateQueries({
        queryKey: keys.list(input.listId),
        exact: true,
      });
    },
    onError: (error: unknown, input: UpdateListInput, context: unknown) => {
      const previous = (context as { previous?: string } | undefined)?.previous;
      if (previous !== undefined) renameList(client, input.listId, previous);
      report(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.listDelete], {
    mutationFn: (input: DeleteListInput) => trpc.lists.delete.mutate(input),
    // Gone from the index at once, even offline; the detail query stays until
    // the server confirms, so a rollback has nothing to refetch.
    onMutate: (input: DeleteListInput) => {
      const previous = findListSummary(client, input.listId);
      removeListSummary(client, input.listId);
      return { previous };
    },
    onSuccess: (_data, input: DeleteListInput) => {
      removeListSummary(client, input.listId);
      client.removeQueries({ queryKey: keys.list(input.listId) });
    },
    onError: (error: unknown, _input: DeleteListInput, context: unknown) => {
      const previous = (context as { previous?: ListSummary } | undefined)
        ?.previous;
      if (previous) upsertListSummary(client, previous);
      report(error);
    },
    retry,
    retryDelay,
  });

  // Membership needs a user id that only a search produces, so it is
  // online-only: `always` never pauses, it just fails and says so.
  const onlineOnly = { networkMode: "always" as const, retry: false };

  /** The server answers with the whole membership, so there is no refetch. */
  const adoptMembers = (listId: string, members: ListMember[]): void => {
    client.setQueryData<ListDetail>(
      keys.list(listId),
      (current) =>
        current && { ...current, members, memberCount: members.length },
    );
    const summary = findListSummary(client, listId);
    if (summary) {
      upsertListSummary(client, { ...summary, memberCount: members.length });
    }
  };

  client.setMutationDefaults([MUTATION.listMemberSet], {
    mutationFn: (input: SetMemberInput) => {
      requireOnline();
      return trpc.lists.members.set.mutate(input);
    },
    onSuccess: (members: ListMember[], input: SetMemberInput) =>
      adoptMembers(input.listId, members),
    onError: report,
    ...onlineOnly,
  });

  client.setMutationDefaults([MUTATION.listMemberRemove], {
    mutationFn: (input: RemoveMemberInput) => {
      requireOnline();
      return trpc.lists.members.remove.mutate(input);
    },
    onSuccess: (members: ListMember[], input: RemoveMemberInput) =>
      adoptMembers(input.listId, members),
    onError: report,
    ...onlineOnly,
  });

  client.setMutationDefaults([MUTATION.listLeave], {
    mutationFn: (input: LeaveListInput) => {
      requireOnline();
      return trpc.lists.members.leave.mutate(input);
    },
    onSuccess: (_data, input: LeaveListInput) => {
      removeListSummary(client, input.listId);
      client.removeQueries({ queryKey: keys.list(input.listId) });
    },
    onError: report,
    ...onlineOnly,
  });

  // ------------------------------------------------------------------ items

  client.setMutationDefaults([MUTATION.itemAdd], {
    mutationFn: (input: AddItemInput) => trpc.items.add.mutate(input),
    onMutate: (input: AddItemInput) => {
      // The id already exists, so there is no temporary id to reconcile when
      // the server finally answers. That is the whole point of ADR 005.
      upsertListItem(client, input.listId, {
        id: input.id,
        listId: input.listId,
        rawText: input.rawText,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        unitText: input.unitText,
        note: input.note,
        categoryId: input.categoryId,
        contentUpdatedAt: input.contentUpdatedAt,
        checkedAt: null,
        checkedBy: null,
        checkUpdatedAt: input.contentUpdatedAt,
        createdAt: input.contentUpdatedAt,
        updatedAt: input.contentUpdatedAt,
        deletedAt: null,
      });
      return { previous: undefined } satisfies ItemSnapshot;
    },
    onSuccess: (written: ItemWriteResult, input: AddItemInput) => {
      adopt(input.listId, written);
      // The catalogue learned a product, which changes tomorrow's suggestions.
      void client.invalidateQueries({ queryKey: keys.catalog(input.listId) });
    },
    onError: (error: unknown, input: AddItemInput) => {
      removeListItem(client, input.listId, input.id);
      report(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.itemUpdate], {
    mutationFn: (input: UpdateItemInput) => trpc.items.update.mutate(input),
    onMutate: (input: UpdateItemInput) => {
      const previous = findListItem(client, input.listId, input.id);
      if (previous) {
        upsertListItem(client, input.listId, {
          ...previous,
          rawText: input.rawText,
          name: input.name,
          quantity: input.quantity,
          unit: input.unit,
          unitText: input.unitText,
          note: input.note,
          categoryId: input.categoryId,
          contentUpdatedAt: input.contentUpdatedAt,
        });
      }
      return { previous } satisfies ItemSnapshot;
    },
    onSuccess: (written: ItemWriteResult, input: UpdateItemInput) => {
      adopt(input.listId, written);
      /**
       * Group last-write-wins loses an edit silently. Optimistic locking at
       * least raised a conflict; here the only signal that your correction
       * went nowhere is that the row came back different, so say so — or the
       * symptom is "I fixed the quantity twice and it keeps reverting", with
       * no explanation available anywhere.
       */
      if (written.item.contentUpdatedAt !== input.contentUpdatedAt) {
        toast.add({ description: i18n.t("feature.lists.item.overwritten") });
      }
    },
    onError: (error: unknown, input: UpdateItemInput, context: unknown) => {
      rollback(input.listId, context);
      report(error);
    },
    retry,
    retryDelay,
  });

  /**
   * Ticking deliberately leaves `contentUpdatedAt` alone.
   *
   * A shopper's queue flushing at 18:40 carries ticks that are legitimately
   * old; their view of the item's NAME is not, and must not clobber a rename
   * made at home at 18:20. The two clocks are separate on purpose.
   */
  const tick = (checked: boolean) => ({
    onMutate: (input: CheckItemInput | UncheckItemInput) => {
      const previous = findListItem(client, input.listId, input.id);
      if (previous) {
        const at = checked ? (input as CheckItemInput).checkedAt : null;
        upsertListItem(client, input.listId, {
          ...previous,
          checkedAt: at,
          checkedBy: checked ? meId() : null,
          checkUpdatedAt: checked
            ? (input as CheckItemInput).checkedAt
            : (input as UncheckItemInput).at,
        });
      }
      return { previous } satisfies ItemSnapshot;
    },
    onSuccess: (
      written: ItemWriteResult,
      input: CheckItemInput | UncheckItemInput,
    ) => {
      // Adopted in silence even when the checkbox visibly flips back: losing
      // a tick race is not an error, and a toast per row would be unusable
      // exactly when a whole queue drains at once.
      adopt(input.listId, written);
    },
    onError: (
      error: unknown,
      input: CheckItemInput | UncheckItemInput,
      context: unknown,
    ) => {
      rollback(input.listId, context);
      report(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.itemCheck], {
    mutationFn: (input: CheckItemInput) => trpc.items.check.mutate(input),
    ...tick(true),
  });

  client.setMutationDefaults([MUTATION.itemUncheck], {
    mutationFn: (input: UncheckItemInput) => trpc.items.uncheck.mutate(input),
    ...tick(false),
  });

  client.setMutationDefaults([MUTATION.itemDelete], {
    mutationFn: (input: DeleteItemInput) => trpc.items.delete.mutate(input),
    onMutate: (input: DeleteItemInput) => {
      const previous = findListItem(client, input.listId, input.id);
      removeListItem(client, input.listId, input.id);
      return { previous } satisfies ItemSnapshot;
    },
    onSuccess: (written: ItemWriteResult) => {
      recordServerTime(written.serverTime);
    },
    onError: (error: unknown, input: DeleteItemInput, context: unknown) => {
      rollback(input.listId, context);
      report(error);
    },
    retry,
    retryDelay,
  });

  // --------------------------------------------------------------- shopping

  /**
   * Taking a list in charge is a consensus question, so it is online-only —
   * and `networkMode: "always"` is what actually makes it so. Under "online"
   * TanStack PAUSES the mutation instead of failing it, and a paused claim is
   * persisted and replayed on reconnection: an hour later, from the car park,
   * taking the list from whoever holds it by then.
   */
  client.setMutationDefaults([MUTATION.shoppingClaim], {
    mutationFn: (input: ClaimSessionInput) => {
      requireOnline();
      return trpc.shopping.claim.mutate(input);
    },
    onSuccess: (session: ShoppingSession, input: ClaimSessionInput) => {
      setListClaim(client, input.listId, session);
    },
    onError: report,
    ...onlineOnly,
  });

  client.setMutationDefaults([MUTATION.shoppingRelease], {
    mutationFn: (input: ReleaseSessionInput) => {
      requireOnline();
      return trpc.shopping.release.mutate(input);
    },
    onSuccess: (_data, input: ReleaseSessionInput) => {
      setListClaim(client, input.listId, null);
    },
    // Release fires on visibilitychange and on unload, so it runs twice and
    // may well run as the tab dies. An error toast there would land on the
    // user at the exact moment they are done and walking away.
    onError: () => undefined,
    ...onlineOnly,
  });

  client.setMutationDefaults([MUTATION.shoppingHeartbeat], {
    mutationFn: (input: HeartbeatInput) => {
      requireOnline();
      return trpc.shopping.heartbeat.mutate(input);
    },
    onSuccess: (session: ShoppingSession, input: HeartbeatInput) => {
      setListClaim(client, input.listId, session);
    },
    // A dead spot is not an event. A failed beat changes nothing on screen.
    onError: () => undefined,
    ...onlineOnly,
  });
};
