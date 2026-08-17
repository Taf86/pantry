import z from "zod";

export function buildDbUrl(params: {
  POSTGRES_HOST: string;
  POSTGRES_PORT: string | number;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
}) {
  const user = encodeURIComponent(params.POSTGRES_USER);
  const password = encodeURIComponent(params.POSTGRES_PASSWORD);
  const port =
    typeof params.POSTGRES_PORT === "string"
      ? params.POSTGRES_PORT
      : params.POSTGRES_PORT.toFixed(0);
  const { POSTGRES_HOST: host, POSTGRES_DB: db } = params;
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

export const rawDbEnvSchema = z.object({
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number(),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
});
