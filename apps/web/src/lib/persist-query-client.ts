import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
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

  // registerMutationDefaults(client);
  return client;
};

const idbPersister = createAsyncStoragePersister({
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
  buster: "v1",
  dehydrateOptions: {
    shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
    shouldDehydrateQuery: (query) => query.state.status === "success",
  },
};
