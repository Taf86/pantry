import type { PantryNode } from "../schemas/pantry.js";

const MS_PER_DAY = 86_400_000;

/**
 * Un item "manca" quando ha una soglia e la giacenza è pari o inferiore.
 * Senza soglia non c'è niente da dedurre: il silenzio è meglio di un falso
 * allarme.
 */
export const isBelowThreshold = (node: PantryNode): boolean =>
  node.kind === "item" &&
  node.deletedAt === null &&
  node.minQuantity !== null &&
  (node.quantity ?? 0) <= node.minQuantity;

/** Giorni interi che mancano alla scadenza; negativo se già scaduto. */
export const daysUntil = (
  isoDate: string,
  today: Date = new Date(),
): number => {
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((target - start) / MS_PER_DAY);
};

export type ExpiryStatus = "expired" | "expiring" | "fresh" | "unknown";

export const expiryStatus = (
  node: PantryNode,
  withinDays: number,
  today: Date = new Date(),
): ExpiryStatus => {
  if (node.kind !== "item" || node.expiresAt === null) return "unknown";
  const remaining = daysUntil(node.expiresAt, today);
  if (remaining < 0) return "expired";
  if (remaining <= withinDays) return "expiring";
  return "fresh";
};

export const EXPIRY_LABELS: Record<ExpiryStatus, string> = {
  expired: "Scaduto",
  expiring: "In scadenza",
  fresh: "Buono",
  unknown: "Senza scadenza",
};
