import { useCallback, useEffect, useRef, useState } from "react";

export type FeedbackStatus = "idle" | "success" | "failure";

/**
 * Transient outcome of an action, shown inline (e.g. by `FeedbackIcon`)
 * instead of a toast. Falls back to `idle` after `resetAfterMs`.
 */
export function useFeedback(resetAfterMs = 2000) {
  const [status, setStatus] = useState<FeedbackStatus>("idle");
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const show = useCallback(
    (next: Exclude<FeedbackStatus, "idle">) => {
      clearTimeout(timeout.current);
      setStatus(next);
      timeout.current = setTimeout(() => setStatus("idle"), resetAfterMs);
    },
    [resetAfterMs],
  );

  return { status, show };
}
