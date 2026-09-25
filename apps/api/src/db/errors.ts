/**
 * Postgres unique violation.
 *
 * Used where the database, rather than application code, is the arbiter: two
 * devices claiming the same shopping lease race to the same partial unique
 * index, and exactly one of them loses here.
 */
export const isUniqueViolation = (
  error: unknown,
  constraint?: string,
): boolean => {
  const candidate = error as
    { code?: unknown; constraint_name?: unknown } | null | undefined;

  if (candidate?.code !== "23505") return false;
  return constraint === undefined || candidate.constraint_name === constraint;
};
