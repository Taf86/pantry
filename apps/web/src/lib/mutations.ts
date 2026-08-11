import type { QueryClient } from "@tanstack/react-query";
import {
  isConflictPayload,
  type AddItemInput,
  type CheckItemInput,
  type ConsumeNodeInput,
  type CreateListInput,
  type CreateNodeInput,
  type CreatePantryInput,
  type DeleteItemInput,
  type DeleteListInput,
  type DeleteNodeInput,
  type DeletePantryInput,
  type ListItem,
  type MoveNodeInput,
  type PantryNode,
  type ShareListInput,
  type SharePantryInput,
  type ToListInput,
  type ToPantryInput,
  type UncheckItemInput,
  type UnshareListInput,
  type UnsharePantryInput,
  type UpdateItemInput,
  type UpdateListInput,
  type UpdateNodeInput,
  type UpdatePantryInput,
} from "pantry-shared";

import {
  findListItem,
  findPantryNode,
  removeListItem,
  removePantryNode,
  upsertListItem,
  upsertPantryNode,
} from "./cache";
import { keys } from "./keys";
import { notify } from "./notify";
import { errorMessage, isApiError, isRetriable, trpc } from "./trpc";

/**
 * Le chiavi di mutazione sono un contratto persistente.
 *
 * Una mutazione messa in pausa mentre si è offline sopravvive in IndexedDB al
 * riavvio dell'app. Al ritorno TanStack Query la riprende cercando la
 * `mutationFn` registrata per la sua chiave: rinominare una chiave significa
 * abbandonare le mutazioni già in coda sui dispositivi. Si aggiunge, non si
 * rinomina.
 */
export const MUTATION = {
  listCreate: "lists.create",
  listUpdate: "lists.update",
  listDelete: "lists.delete",
  listShare: "lists.share",
  listUnshare: "lists.unshare",

  itemAdd: "items.add",
  itemUpdate: "items.update",
  itemCheck: "items.check",
  itemUncheck: "items.uncheck",
  itemDelete: "items.delete",

  pantryCreate: "pantries.create",
  pantryUpdate: "pantries.update",
  pantryDelete: "pantries.delete",
  pantryShare: "pantries.share",
  pantryUnshare: "pantries.unshare",

  nodeCreate: "nodes.create",
  nodeUpdate: "nodes.update",
  nodeDelete: "nodes.delete",
  nodeMove: "nodes.move",
  nodeConsume: "nodes.consume",

  pantryToList: "pantries.toList",
  shoppingToPantry: "shopping.toPantry",
} as const;

export type MutationName = (typeof MUTATION)[keyof typeof MUTATION];

/** Contesto di rollback: la riga com'era prima dell'aggiornamento ottimistico. */
interface ItemSnapshot {
  previous: ListItem | undefined;
}
interface NodeSnapshot {
  previous: PantryNode | undefined;
}

const now = (): string => new Date().toISOString();

/**
 * Ritentare ha senso solo per gli errori transitori. Un `FORBIDDEN` non
 * cambia esito, e una coda che lo ritenta all'infinito non si svuota più.
 */
const retry = (failureCount: number, error: unknown): boolean =>
  isRetriable(error) && failureCount < 8;

const retryDelay = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 30_000);

/**
 * Il conflitto di versione non è un errore da mostrare come tale: il server ha
 * ragione, il client accetta il suo stato e lo dice con un avviso.
 */
const acceptServerState = (
  client: QueryClient,
  error: unknown,
  onCurrent: (current: unknown) => void,
): boolean => {
  if (!isApiError(error) || error.data?.code !== "CONFLICT") return false;

  const payload = (error.data as { conflict?: unknown }).conflict;
  if (isConflictPayload(payload) && payload.current !== null) {
    onCurrent(payload.current);
  }
  notify(
    "warning",
    "Qualcuno ha modificato questo elemento: ho preso la sua versione.",
  );
  void client.invalidateQueries();
  return true;
};

const reportFailure = (error: unknown): void => {
  notify("error", errorMessage(error));
};

/**
 * Registra le `mutationFn` e le regole di cache per ogni chiave.
 *
 * Tutta la logica sta qui e non nei componenti, per una ragione precisa: una
 * mutazione ripristinata da IndexedDB dopo un riavvio non ha più il componente
 * che l'ha lanciata. Se `onSuccess` vivesse lì, la riconciliazione al ritorno
 * della rete non avverrebbe mai.
 */
export const registerMutationDefaults = (client: QueryClient): void => {
  const invalidateLists = () =>
    void client.invalidateQueries({ queryKey: keys.lists() });
  const invalidatePantries = () =>
    void client.invalidateQueries({ queryKey: keys.pantries() });

  // ---------------------------------------------------------------- liste

  client.setMutationDefaults([MUTATION.listCreate], {
    mutationFn: (input: CreateListInput) => trpc.lists.create.mutate(input),
    onSuccess: invalidateLists,
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.listUpdate], {
    mutationFn: (input: UpdateListInput) => trpc.lists.update.mutate(input),
    onSuccess: (_data, input: UpdateListInput) => {
      invalidateLists();
      void client.invalidateQueries({ queryKey: keys.list(input.listId) });
    },
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.listDelete], {
    mutationFn: (input: DeleteListInput) => trpc.lists.delete.mutate(input),
    onSuccess: invalidateLists,
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.listShare], {
    mutationFn: (input: ShareListInput) => trpc.lists.share.mutate(input),
    onSuccess: (_data, input: ShareListInput) =>
      void client.invalidateQueries({ queryKey: keys.list(input.listId) }),
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.listUnshare], {
    mutationFn: (input: UnshareListInput) => trpc.lists.unshare.mutate(input),
    onSuccess: (_data, input: UnshareListInput) =>
      void client.invalidateQueries({ queryKey: keys.list(input.listId) }),
    onError: reportFailure,
    retry,
    retryDelay,
  });

  // ------------------------------------------------------------- prodotti

  client.setMutationDefaults([MUTATION.itemAdd], {
    mutationFn: (input: AddItemInput) => trpc.items.add.mutate(input),
    onMutate: (input: AddItemInput) => {
      // L'ID esiste già: nessun ID temporaneo da riconciliare al ritorno.
      const optimistic: ListItem = {
        id: input.id,
        listId: input.listId,
        name: input.name,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        checkedAt: null,
        checkedBy: null,
        sortOrder: input.sortOrder ?? 0,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null,
      };
      upsertListItem(client, input.listId, optimistic);
      return { previous: undefined } satisfies ItemSnapshot;
    },
    onSuccess: (item: ListItem) => upsertListItem(client, item.listId, item),
    onError: (error: unknown, input: AddItemInput) => {
      removeListItem(client, input.listId, input.id);
      reportFailure(error);
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
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.quantity === undefined
            ? {}
            : { quantity: input.quantity ?? null }),
          ...(input.unit === undefined ? {} : { unit: input.unit ?? null }),
          ...(input.categoryId === undefined
            ? {}
            : { categoryId: input.categoryId ?? null }),
          ...(input.note === undefined ? {} : { note: input.note ?? null }),
          updatedAt: now(),
        });
      }
      return { previous } satisfies ItemSnapshot;
    },
    onSuccess: (item: ListItem) => upsertListItem(client, item.listId, item),
    onError: (error: unknown, input: UpdateItemInput, context) => {
      const handled = acceptServerState(client, error, (current) =>
        upsertListItem(client, input.listId, current as ListItem),
      );
      if (handled) return;

      const snapshot = context as ItemSnapshot | undefined;
      if (snapshot?.previous) {
        upsertListItem(client, input.listId, snapshot.previous);
      }
      reportFailure(error);
    },
    retry,
    retryDelay,
  });

  const checkDefaults = (checked: boolean) => ({
    onMutate: (input: CheckItemInput | UncheckItemInput) => {
      const previous = findListItem(client, input.listId, input.id);
      if (previous) {
        upsertListItem(client, input.listId, {
          ...previous,
          checkedAt: checked
            ? ((input as CheckItemInput).checkedAt ?? now())
            : null,
          updatedAt: now(),
        });
      }
      return { previous } satisfies ItemSnapshot;
    },
    onSuccess: (item: ListItem) => upsertListItem(client, item.listId, item),
    onError: (
      error: unknown,
      input: CheckItemInput | UncheckItemInput,
      context: unknown,
    ) => {
      const snapshot = context as ItemSnapshot | undefined;
      if (snapshot?.previous) {
        upsertListItem(client, input.listId, snapshot.previous);
      }
      reportFailure(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.itemCheck], {
    mutationFn: (input: CheckItemInput) => trpc.items.check.mutate(input),
    ...checkDefaults(true),
  });

  client.setMutationDefaults([MUTATION.itemUncheck], {
    mutationFn: (input: UncheckItemInput) => trpc.items.uncheck.mutate(input),
    ...checkDefaults(false),
  });

  client.setMutationDefaults([MUTATION.itemDelete], {
    mutationFn: (input: DeleteItemInput) => trpc.items.delete.mutate(input),
    onMutate: (input: DeleteItemInput) => {
      const previous = findListItem(client, input.listId, input.id);
      removeListItem(client, input.listId, input.id);
      return { previous } satisfies ItemSnapshot;
    },
    onError: (error: unknown, input: DeleteItemInput, context) => {
      const snapshot = context as ItemSnapshot | undefined;
      if (snapshot?.previous) {
        upsertListItem(client, input.listId, snapshot.previous);
      }
      reportFailure(error);
    },
    retry,
    retryDelay,
  });

  // ------------------------------------------------------------- dispense

  client.setMutationDefaults([MUTATION.pantryCreate], {
    mutationFn: (input: CreatePantryInput) =>
      trpc.pantries.create.mutate(input),
    onSuccess: invalidatePantries,
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.pantryUpdate], {
    mutationFn: (input: UpdatePantryInput) =>
      trpc.pantries.update.mutate(input),
    onSuccess: invalidatePantries,
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.pantryDelete], {
    mutationFn: (input: DeletePantryInput) =>
      trpc.pantries.delete.mutate(input),
    onSuccess: invalidatePantries,
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.pantryShare], {
    mutationFn: (input: SharePantryInput) => trpc.pantries.share.mutate(input),
    onSuccess: (_data, input: SharePantryInput) =>
      void client.invalidateQueries({ queryKey: keys.pantry(input.pantryId) }),
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.pantryUnshare], {
    mutationFn: (input: UnsharePantryInput) =>
      trpc.pantries.unshare.mutate(input),
    onSuccess: (_data, input: UnsharePantryInput) =>
      void client.invalidateQueries({ queryKey: keys.pantry(input.pantryId) }),
    onError: reportFailure,
    retry,
    retryDelay,
  });

  // ------------------------------------------------------------ nodi

  client.setMutationDefaults([MUTATION.nodeCreate], {
    mutationFn: (input: CreateNodeInput) => trpc.nodes.create.mutate(input),
    onMutate: (input: CreateNodeInput) => {
      const optimistic: PantryNode = {
        id: input.id,
        pantryId: input.pantryId,
        parentId: input.parentId ?? null,
        kind: input.kind,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        categoryId: input.categoryId ?? null,
        expiresAt: input.expiresAt ?? null,
        minQuantity: input.minQuantity ?? null,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null,
      };
      upsertPantryNode(client, input.pantryId, optimistic);
      return { previous: undefined } satisfies NodeSnapshot;
    },
    onSuccess: (node: PantryNode) =>
      upsertPantryNode(client, node.pantryId, node),
    onError: (error: unknown, input: CreateNodeInput) => {
      removePantryNode(client, input.pantryId, input.id);
      reportFailure(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.nodeUpdate], {
    mutationFn: (input: UpdateNodeInput) => trpc.nodes.update.mutate(input),
    onMutate: (input: UpdateNodeInput) => {
      const previous = findPantryNode(client, input.pantryId, input.id);
      if (previous) {
        upsertPantryNode(client, input.pantryId, {
          ...previous,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.quantity === undefined
            ? {}
            : { quantity: input.quantity ?? null }),
          ...(input.unit === undefined ? {} : { unit: input.unit ?? null }),
          ...(input.categoryId === undefined
            ? {}
            : { categoryId: input.categoryId ?? null }),
          ...(input.expiresAt === undefined
            ? {}
            : { expiresAt: input.expiresAt ?? null }),
          ...(input.minQuantity === undefined
            ? {}
            : { minQuantity: input.minQuantity ?? null }),
          updatedAt: now(),
        });
      }
      return { previous } satisfies NodeSnapshot;
    },
    onSuccess: (node: PantryNode) =>
      upsertPantryNode(client, node.pantryId, node),
    onError: (error: unknown, input: UpdateNodeInput, context) => {
      const handled = acceptServerState(client, error, (current) =>
        upsertPantryNode(client, input.pantryId, current as PantryNode),
      );
      if (handled) return;

      const snapshot = context as NodeSnapshot | undefined;
      if (snapshot?.previous) {
        upsertPantryNode(client, input.pantryId, snapshot.previous);
      }
      reportFailure(error);
    },
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.nodeDelete], {
    mutationFn: (input: DeleteNodeInput) => trpc.nodes.delete.mutate(input),
    onSuccess: (result: { ids: string[] }, input: DeleteNodeInput) => {
      for (const id of result.ids) removePantryNode(client, input.pantryId, id);
    },
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.nodeMove], {
    mutationFn: (input: MoveNodeInput) => trpc.nodes.move.mutate(input),
    onSuccess: (node: PantryNode) =>
      upsertPantryNode(client, node.pantryId, node),
    // Nessun aggiornamento ottimistico: l'invariante strutturale la decide il
    // server, e mostrare uno spostamento che verrà rifiutato sarebbe peggio.
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.nodeConsume], {
    mutationFn: (input: ConsumeNodeInput) => trpc.nodes.consume.mutate(input),
    onMutate: (input: ConsumeNodeInput) => {
      const previous = findPantryNode(client, input.pantryId, input.id);
      if (previous) {
        upsertPantryNode(client, input.pantryId, {
          ...previous,
          quantity: Math.max((previous.quantity ?? 0) - input.delta, 0),
          updatedAt: now(),
        });
      }
      return { previous } satisfies NodeSnapshot;
    },
    onSuccess: (node: PantryNode) =>
      upsertPantryNode(client, node.pantryId, node),
    onError: (error: unknown, input: ConsumeNodeInput, context) => {
      const snapshot = context as NodeSnapshot | undefined;
      if (snapshot?.previous) {
        upsertPantryNode(client, input.pantryId, snapshot.previous);
      }
      reportFailure(error);
    },
    retry,
    retryDelay,
  });

  // ---------------------------------------------------------------- ponte

  client.setMutationDefaults([MUTATION.pantryToList], {
    mutationFn: (input: ToListInput) => trpc.pantries.toList.mutate(input),
    onSuccess: (_data, input: ToListInput) => {
      void client.invalidateQueries({ queryKey: keys.listItems(input.listId) });
      invalidateLists();
    },
    onError: reportFailure,
    retry,
    retryDelay,
  });

  client.setMutationDefaults([MUTATION.shoppingToPantry], {
    mutationFn: (input: ToPantryInput) => trpc.shopping.toPantry.mutate(input),
    onSuccess: (_data, input: ToPantryInput) => {
      void client.invalidateQueries({ queryKey: keys.listItems(input.listId) });
      void client.invalidateQueries({
        queryKey: keys.pantryNodes(input.pantryId),
      });
      void client.invalidateQueries({ queryKey: keys.shoppingSession() });
    },
    onError: reportFailure,
    retry,
    retryDelay,
  });
};
