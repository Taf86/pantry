import * as z from "zod";
import { buildDbUrl, rawDbEnvSchema } from "./db.js";
import { parseEnvOrThrow } from "./parse-env.js";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const envSchema = rawDbEnvSchema
  .safeExtend({
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

    VAPID_PUBLIC_KEY: optionalText,
    VAPID_PRIVATE_KEY: optionalText,
    VAPID_SUBJECT: optionalText.refine(
      (value) =>
        value === undefined ||
        value.startsWith("mailto:") ||
        value.startsWith("https://"),
      { message: "must be a mailto: address or an https: URL" },
    ),
  })
  .check((ctx) => {
    const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: key } = ctx.value;
    if ((pub === undefined) !== (key === undefined)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: [pub === undefined ? "VAPID_PUBLIC_KEY" : "VAPID_PRIVATE_KEY"],
        message: "both VAPID keys are required, or neither",
      });
      return;
    }
    if (pub === undefined || key === undefined) return;

    const publicBytes = Buffer.from(pub, "base64url");
    if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["VAPID_PUBLIC_KEY"],
        message: "must be a base64url uncompressed P-256 point (65 bytes)",
      });
    }
    if (Buffer.from(key, "base64url").length !== 32) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["VAPID_PRIVATE_KEY"],
        message: "must be a base64url P-256 scalar (32 bytes)",
      });
    }
  });

export type RawEnv = z.infer<typeof envSchema>;
export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface AppConfig extends RawEnv {
  databaseUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  push: PushConfig | null;
  isProduction: boolean;
  isTest: boolean;
}

export const loadConfig = (
  source: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const env = parseEnvOrThrow(envSchema, source);
  const isProduction = env.NODE_ENV === "production";
  const scheme = isProduction ? "https" : "http";
  const appUrl = `${scheme}://${env.DOMAIN}`;

  const extra = (env.EXTRA_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const push: PushConfig | null =
    env.VAPID_PUBLIC_KEY !== undefined && env.VAPID_PRIVATE_KEY !== undefined
      ? {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT ?? `mailto:admin@${env.DOMAIN}`,
        }
      : null;

  return {
    ...env,
    databaseUrl: buildDbUrl(env),
    push,
    appUrl,
    trustedOrigins: [appUrl, ...extra],
    isProduction,
    isTest: env.NODE_ENV === "test",
  };
};
