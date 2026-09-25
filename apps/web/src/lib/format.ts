import {
  UNITS,
  isUnitCode,
  type ListItem,
  type UnitCode,
} from "@pantry/shared";

/**
 * How a quantity reads on a row.
 *
 * The locale is an argument rather than a module import so this stays pure and
 * testable, and so a language change re-renders rather than leaving stale
 * numbers behind.
 */
export const formatNumber = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);

export interface QuantityParts {
  quantity: string | null;
  /** Either a translation key for a canonical unit, or raw text to show as is. */
  unitKey: UnitCode | null;
  unitText: string | null;
}

/**
 * Splits an item's amount into what the UI has to translate and what it must
 * not. A canonical unit gets an i18n key with the count, so plurals work; a
 * packaging word the user typed is shown verbatim, because there is nothing
 * honest to translate it to.
 */
export const quantityParts = (
  item: Pick<ListItem, "quantity" | "unit" | "unitText">,
  locale: string,
): QuantityParts => ({
  quantity: item.quantity === null ? null : formatNumber(item.quantity, locale),
  unitKey: item.unit !== null && isUnitCode(item.unit) ? item.unit : null,
  unitText: item.unitText,
});

/** Base-unit amount, for comparing two items that measure the same thing. */
export const comparableAmount = (
  quantity: number | null,
  unit: UnitCode | null,
): number | null =>
  quantity === null || unit === null ? null : quantity * UNITS[unit].base;
