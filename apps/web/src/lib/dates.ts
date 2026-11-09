/** What a cell shows when there is no date to show. */
export const NO_DATE = "—";

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

const dateTimeFormat = (locale: string): Intl.DateTimeFormat => {
  const cached = dateTimeFormats.get(locale);
  if (cached) return cached;

  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  dateTimeFormats.set(locale, format);
  return format;
};

export const formatDateTime = (
  value: string | Date | null | undefined,
  locale: string,
): string =>
  value === null || value === undefined
    ? NO_DATE
    : dateTimeFormat(locale).format(new Date(value));
