const quantityFormatter = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 3,
});

/** "2 l", "1,5 kg", oppure `null` se non c'è nulla da dire. */
export const formatQuantity = (
  quantity: number | null,
  unit: string | null,
): string | null => {
  if (quantity === null && unit === null) return null;
  if (quantity === null) return unit;
  const amount = quantityFormatter.format(quantity);
  return unit === null ? amount : `${amount} ${unit}`;
};

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export const formatDate = (iso: string | null): string => {
  if (iso === null) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
};

const relativeFormatter = new Intl.RelativeTimeFormat("it-IT", {
  numeric: "auto",
});

/** "fra 3 giorni", "2 giorni fa": più leggibile di una data per le scadenze. */
export const formatDays = (days: number): string =>
  relativeFormatter.format(days, "day");
