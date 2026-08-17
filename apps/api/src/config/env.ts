import z from "zod";
import { buildDbUrl, rawDbEnvSchema } from "./db.js";

const envSchema = rawDbEnvSchema.safeExtend({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DOMAIN: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(16),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

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
    databaseUrl: buildDbUrl(env),
    appUrl,
    trustedOrigins: [appUrl, ...extra],
    isProduction,
    isTest: env.NODE_ENV === "test",
  };
};
