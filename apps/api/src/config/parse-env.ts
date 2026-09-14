import type z from "zod";

export function parseEnvOrThrow<T extends z.ZodType>(
  schema: T,
  source: unknown,
): z.output<T> {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${details}`);
  }

  return parsed.data;
}
