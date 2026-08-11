import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

import { registerMutationDefaults } from "./mutations";
import { isRetriable } from "./trpc";

const WEEK_IN_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * `offlineFirst` è la scelta centrale.
 *
 * Con `online` (il default) TanStack Query non parte nemmeno quando il browser
 * si dichiara offline. Fra gli scaffali il browser sbaglia spesso: dice
 * "online" con una connessione che non trasporta un byte, e a volte il
 * contrario. `offlineFirst` prova comunque, e se fallisce la mutazione va in
 * pausa — che è esattamente il comportamento voluto.
 */
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

/**
 * Cache su IndexedDB, non su localStorage: la sessione di spesa di più liste
 * supera facilmente la quota dei 5 MB, e localStorage è sincrono.
 */
const idbPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((value) => value ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: "pantry-cache",
  throttleTime: 1000,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: idbPersister,
  maxAge: WEEK_IN_MS,
  /**
   * Cambiare questa stringa invalida la cache di tutti i dispositivi: è la
   * valvola di sicurezza per quando la forma dei dati cambia in modo
   * incompatibile.
   */
  buster: "v1",
  dehydrateOptions: {
    /**
     * Si persistono solo le mutazioni in pausa. Quelle già partite sono in
     * volo verso il server: rigiocarle al riavvio sarebbe un duplicato — che
     * il `mutationId` fermerebbe comunque lato server, ma tanto vale non
     * generarlo.
     */
    shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
    shouldDehydrateQuery: (query) => query.state.status === "success",
  },
};
