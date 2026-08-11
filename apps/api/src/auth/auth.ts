import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { MIN_PASSWORD_LENGTH } from "pantry-shared";

import type { Database } from "../db/client.js";
import { accounts, sessions, users, verifications } from "../db/schema/auth.js";
import type { AppConfig } from "../env.js";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

/**
 * Better Auth con sessioni su database.
 *
 * Nessuna auto-registrazione: `disableSignUp` chiude la porta d'ingresso, e
 * gli account nascono solo dal backoffice (§5). L'unico flusso di credenziali
 * è email + password, e la password viene scelta accettando un invito.
 *
 * Frontend e API stanno sulla stessa origin, quindi il cookie di sessione
 * viaggia da solo: niente CORS e — soprattutto — l'handshake WebSocket è
 * autenticato senza header custom, che il browser non permetterebbe.
 */
export const createAuth = (db: Database, config: AppConfig) =>
  betterAuth({
    appName: "Pantry",
    baseURL: config.appUrl,
    basePath: "/api/auth",
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: config.trustedOrigins,

    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
      transaction: true,
    }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      requireEmailVerification: false,
    },

    user: {
      modelName: "users",
      fields: { name: "displayName" },
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
        status: {
          type: "string",
          required: false,
          defaultValue: "invited",
          input: false,
        },
      },
    },
    session: {
      modelName: "sessions",
      expiresIn: THIRTY_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },

    advanced: {
      cookiePrefix: "pantry",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction,
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
export type AuthContext = Awaited<Auth["$context"]>;
