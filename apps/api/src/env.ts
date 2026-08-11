import { z } from "zod";

/**
 * Configurazione del processo.
 *
 * `DATABASE_URL` non è una variabile d'ambiente: si compone qui dalle sue
 * parti. Se la password vivesse in due posti, prima o poi la rotazione ne
 * dimenticherebbe uno.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DOMAIN: z.string().min(1),

  POSTGRES_HOST: z.string().default("db"),
  POSTGRES_PORT: z.coerce.number().int().default(5432),
  POSTGRES_USER: z.string().default("pantry"),
  POSTGRES_DB: z.string().default("pantry"),
  POSTGRES_PASSWORD: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(16),

  /** Numero massimo di connessioni verso Postgres. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * Origini extra ammesse oltre a `https://<DOMAIN>`: serve solo in sviluppo,
   * dove Vite gira su un'altra porta.
   */
  EXTRA_ORIGINS: z.string().optional(),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface AppConfig extends RawEnv {
  databaseUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  isProduction: boolean;
  isTest: boolean;
}

const buildDatabaseUrl = (env: RawEnv): string => {
  const user = encodeURIComponent(env.POSTGRES_USER);
  const password = encodeURIComponent(env.POSTGRES_PASSWORD);
  return `postgres://${user}:${password}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;
};

export const loadConfig = (
  source: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configurazione non valida:\n${details}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";
  const scheme = isProduction ? "https" : "http";
  const appUrl = `${scheme}://${env.DOMAIN}`;

  const extra = (env.EXTRA_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    ...env,
    databaseUrl: buildDatabaseUrl(env),
    appUrl,
    trustedOrigins: [appUrl, ...extra],
    isProduction,
    isTest: env.NODE_ENV === "test",
  };
};
