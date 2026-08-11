import { onlineManager, useMutationState } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export type SyncState = "online" | "offline" | "syncing";

const subscribeToOnline = (callback: () => void): (() => void) =>
  onlineManager.subscribe(callback);

const getOnlineSnapshot = (): boolean => onlineManager.isOnline();

export const useIsOnline = (): boolean =>
  useSyncExternalStore(subscribeToOnline, getOnlineSnapshot, () => true);

/**
 * Stato di sincronizzazione sempre visibile: `online`,
 * `offline, N modifiche in coda`, `sincronizzazione…`.
 *
 * Al supermercato l'unica domanda che conta è "le mie spunte si sono
 * salvate?". Nascondere la risposta è il modo più rapido per far perdere
 * fiducia nell'app.
 */
export const useSyncStatus = (): {
  state: SyncState;
  pending: number;
  label: string;
} => {
  const online = useIsOnline();

  const pausedCount = useMutationState({
    filters: {
      status: "pending",
      predicate: (mutation) => mutation.state.isPaused,
    },
    select: (mutation) => mutation.mutationId,
  }).length;

  const inFlightCount = useMutationState({
    filters: {
      status: "pending",
      predicate: (mutation) => !mutation.state.isPaused,
    },
    select: (mutation) => mutation.mutationId,
  }).length;

  if (!online) {
    return {
      state: "offline",
      pending: pausedCount,
      label:
        pausedCount === 0
          ? "Offline"
          : `Offline · ${pausedCount} ${pausedCount === 1 ? "modifica" : "modifiche"} in coda`,
    };
  }

  if (inFlightCount > 0 || pausedCount > 0) {
    return {
      state: "syncing",
      pending: pausedCount + inFlightCount,
      label: "Sincronizzazione…",
    };
  }

  return { state: "online", pending: 0, label: "Online" };
};
