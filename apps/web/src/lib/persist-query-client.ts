import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import type {
  PersistedClient,
  PersistQueryClientOptions,
} from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { isQueueable, registerMutationDefaults } from "./mutations";
import { isRetriable } from "./trpc";
import { PERSIST_KEY } from "./pwa";

const WEEK_IN_MS = 1000 * 60 * 60 * 24 * 7;

export const createAppQueryClient = (): QueryClient => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "offlineFirst",
        staleTime: 30_000,
        gcTime: WEEK_IN_MS,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => isRetriable(error) && failureCount < 3,
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });

  registerMutationDefaults(client);
  return client;
};

export const idbPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((value) => value ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: PERSIST_KEY,
  throttleTime: 1000,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: idbPersister,
  maxAge: WEEK_IN_MS,
  // Bumped with the shape of what is persisted. List items gained two
  // last-write-wins clocks; rehydrating a week-old cache written before them
  // would feed NaN into every comparison, and NaN loses silently to everything.
  buster: "v3",
  dehydrateOptions: {
    /**
     * Belt and braces over the online-only mutations.
     *
     * They already use `networkMode: "always"`, so they fail rather than
     * pause and should never be seen here. If a future change ever made one
     * pause, this is what stops it reaching IndexedDB and being replayed from
     * the car park an hour later.
     */
    shouldDehydrateMutation: (mutation) =>
      mutation.state.isPaused && isQueueable(mutation.options.mutationKey),
    shouldDehydrateQuery: (query) => query.state.status === "success",
  },
};

/**
 * Writes the cache to IndexedDB right now, and waits for it.
 *
 * The persister throttles by a second and its write is fire-and-forget:
 * prefetch a shopping trip, lock the phone and walk into the shop inside that
 * second, and the prefetched lists may never reach storage — the user arrives
 * offline with an empty list, having just been told they were ready.
 *
 * It writes through idb-keyval directly rather than through the persister,
 * which throttles, and deliberately NOT through `persistQueryClient`, which
 * also RESTORES from storage and would put the stale cache back over the fresh
 * one. The serialized shape has to match what the persister writes, which is
 * why this lives next to it.
 */
export const flushPersistedCache = async (
  queryClient: QueryClient,
): Promise<void> => {
  const snapshot: PersistedClient = {
    buster: persistOptions.buster ?? "",
    timestamp: Date.now(),
    clientState: dehydrate(queryClient, persistOptions.dehydrateOptions),
  };
  await set(PERSIST_KEY, JSON.stringify(snapshot));
};
