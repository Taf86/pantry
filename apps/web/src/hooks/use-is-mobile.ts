import { useCallback, useSyncExternalStore } from "react";

const DESKTOP_QUERY = "(min-width: 48rem)";

const matchMedia = (query: string) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => matchMedia(query)?.matches ?? false,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const getServerSnapshot = () => false;

export function useIsMobile(): boolean {
  return !useMediaQuery(DESKTOP_QUERY);
}
