import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * The same notion of "online" the mutation layer uses.
 *
 * Reading `navigator.onLine` directly could disagree with TanStack, and a
 * button enabled by one while the other refuses the write is the worst of both.
 */
export const useIsOnline = (): boolean =>
  useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
  );
