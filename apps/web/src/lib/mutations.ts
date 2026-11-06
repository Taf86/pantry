import { onlineManager, type QueryClient } from "@tanstack/react-query";
import type {
  CreateListInput,
  DeleteListInput,
  ListMembers,
  ListSummary,
  RemoveMemberInput,
  SetMemberInput,
  UpdateListInput,
  User,
} from "@pantry/shared";
import { Role } from "@pantry/shared";
import i18n from "i18next";
import { toast } from "@/components/ui/toast";
import {
  findListSummary,
  removeListSummary,
  renameList,
  upsertListSummary,
} from "./cache";
import { keys } from "./keys";
import { isApiError, isRetriable, trpc } from "./trpc";

export const MUTATION = {
  listCreate: "lists.create",
  listUpdate: "lists.update",
  listDelete: "lists.delete",
  listMemberSet: "lists.members.set",
  listMemberRemove: "lists.members.remove",
} as const;

export type MutationName = (typeof MUTATION)[keyof typeof MUTATION];

const QUEUEABLE: ReadonlySet<string> = new Set<string>([
  MUTATION.listCreate,
  MUTATION.listUpdate,
  MUTATION.listDelete,
]);

export const isQueueable = (mutationKey: unknown): boolean =>
  Array.isArray(mutationKey) &&
  typeof mutationKey[0] === "string" &&
  QUEUEABLE.has(mutationKey[0]);

export const listScope = (listId: string): string => `list:${listId}`;

export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

export const isOfflineError = (error: unknown): error is OfflineError =>
  error instanceof OfflineError;

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

const retry = (failureCount: number, error: unknown): boolean =>
  isRetriable(error) && failureCount < 8;

const retryDelay = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 30_000);

export const registerMutationDefaults = (client: QueryClient): void => {
  const invalidateIndex = () =>
    void client.invalidateQueries({ queryKey: keys.lists(), exact: true });

  client.setMutationDefaults([MUTATION.listCreate], {
    mutationFn: (input: CreateListInput) => trpc.lists.create.mutate(input),
    onMutate: (input: CreateListInput) => {
      const me = client.getQueryData<User | null>(keys.me()) ?? null;
      upsertListSummary(client, {
        id: input.id,
        name: input.name,
        createdBy: me?.id ?? "",
        createdByDisplayName: me?.displayName ?? "",
        permissions: Role.Owner,
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
    // onSuccess: (_data, input: UpdateListInput) => {
    onSuccess: () => {
      invalidateIndex();
      // void client.invalidateQueries({
      //   queryKey: keys.list(input.listId),
      //   exact: true,
      // });
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
    onMutate: (input: DeleteListInput) => {
      const previous = findListSummary(client, input.listId);
      removeListSummary(client, input.listId);
      return { previous };
    },
    onSuccess: (_data, input: DeleteListInput) => {
      removeListSummary(client, input.listId);
      // client.removeQueries({ queryKey: keys.list(input.listId) });
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

  const onlineOnly = { networkMode: "always" as const, retry: false };
  const requireOnline = (): void => {
    if (!onlineManager.isOnline()) throw new OfflineError();
  };

  const adoptMembers = (listId: string, members: ListMembers): void => {
    client.setQueryData<ListMembers>(keys.listMembers(listId), () => members);
  };

  client.setMutationDefaults([MUTATION.listMemberSet], {
    mutationFn: (input: SetMemberInput) => {
      requireOnline();
      return trpc.lists.members.set.mutate(input);
    },
    onSuccess: (members: ListMembers, input: SetMemberInput) =>
      adoptMembers(input.listId, members),
    onError: report,
    ...onlineOnly,
  });

  client.setMutationDefaults([MUTATION.listMemberRemove], {
    mutationFn: (input: RemoveMemberInput) => {
      requireOnline();
      return trpc.lists.members.remove.mutate(input);
    },
    onSuccess: (members: ListMembers, input: RemoveMemberInput) =>
      adoptMembers(input.listId, members),
    onError: report,
    ...onlineOnly,
  });
};
