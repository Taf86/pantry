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
