/**
 * The name of the database constraint a failed write violated.
 *
 * Drizzle wraps the driver error in one of its own whose message is only
 * "Failed query: ...", so asserting on the message would pass for any failure
 * at all. The constraint name lives further down the cause chain, and this
 * walks it rather than assuming a depth.
 *
 * Returns `null` when the write succeeded, which makes the failure of a test
 * that expected a violation read as `null` instead of the constraint name.
 */
export const violatedConstraint = async (
  run: () => Promise<unknown>,
): Promise<string | null> => {
  try {
    await run();
    return null;
  } catch (error) {
    for (
      let current: unknown = error, depth = 0;
      current !== null && current !== undefined && depth < 8;
      current = (current as { cause?: unknown }).cause, depth += 1
    ) {
      const named = current as {
        constraint_name?: unknown;
        constraint?: unknown;
      };
      const name = named.constraint_name ?? named.constraint;
      if (typeof name === "string") return name;
    }
    throw error;
  }
};
