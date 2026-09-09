import type { QueryClient } from "@tanstack/react-query";
import { del } from "idb-keyval";
import { API_CACHE_NAME, PERSIST_KEY } from "./pwa";

export const clearLocalUserData = async (
  queryClient: QueryClient,
): Promise<void> => {
  queryClient.clear();

  await Promise.allSettled([
    del(PERSIST_KEY),
    "caches" in globalThis
      ? caches.delete(API_CACHE_NAME)
      : Promise.resolve(false),
  ]);
};
