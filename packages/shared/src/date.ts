type SerializedDatesValue<V> = V extends Date
  ? string
  : V extends (...args: never[]) => unknown
    ? V
    : V extends object
      ? { [K in keyof V]: SerializedDatesValue<V[K]> }
      : V;

export type SerializedDates<T extends Record<string, unknown>> = {
  [K in keyof T]: SerializedDatesValue<T[K]>;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function convert(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(convert);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, convert(v)]),
    );
  }
  return value;
}

export function serializeDates<T extends Record<string, unknown>>(
  dto: T,
): SerializedDates<T> {
  return convert(dto) as SerializedDates<T>;
}
