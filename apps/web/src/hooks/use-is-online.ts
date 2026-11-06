import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export const useIsOnline = (): boolean =>
  useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
  );
