import { copyToClipboard } from "@/lib/share";
import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "failed";

/**
 * Copies text to the clipboard and exposes a transient `status`,
 * so the caller can give inline feedback instead of a toast.
 */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text);
      clearTimeout(timeout.current);
      setStatus(ok ? "copied" : "failed");
      timeout.current = setTimeout(() => setStatus("idle"), resetAfterMs);
      return ok;
    },
    [resetAfterMs],
  );

  return { status, copy };
}
