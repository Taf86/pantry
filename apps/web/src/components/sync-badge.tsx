import { useSyncStatus } from "../hooks/use-network";

const TONE = {
  online: "badge--accent",
  syncing: "badge--warning",
  offline: "badge--danger",
} as const;

/**
 * Indicatore di stato sempre visibile.
 *
 * Al supermercato l'unica domanda che conta è "le mie spunte si sono
 * salvate?": la risposta deve stare sullo schermo, non dentro un menu.
 */
export const SyncBadge = () => {
  const { state, label } = useSyncStatus();

  return (
    <span className={`badge ${TONE[state]}`} role="status" aria-live="polite">
      <span className="sync-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
};
