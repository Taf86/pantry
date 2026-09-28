import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { MIN_PASSWORD_LENGTH, UserRole, UserStatus } from "@pantry/shared";

import type { Database } from "./db/client.js";
import { accounts, sessions, users, verifications } from "./db/schema/index.js";
import type { AppConfig } from "./config/env.js";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

export interface AuthHooks {
  /**
   * A session Better Auth deleted: sign-out, revoke-session, revoke-other-
   * sessions. Runs after the transaction commits, so the session is gone for
   * good when the sockets opened with it are closed.
   */
  onSessionDeleted?: (sessionId: string) => void;
}

export const createAuth = (
  db: Database,
  config: AppConfig,
  hooks: AuthHooks = {},
) =>
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
          defaultValue: UserRole.user,
          input: false,
        },
        status: {
          type: "string",
          required: false,
          defaultValue: UserStatus.unactivated,
          input: false,
        },
        lastSeenAt: {
          type: "date",
          required: false,
          defaultValue: null,
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

    // Only deletes that go through Better Auth reach this: the admin service
    // deletes sessions itself, and disconnects the user on its own.
    databaseHooks: {
      session: {
        delete: {
          after: (session) => {
            hooks.onSessionDeleted?.(session.id);
            return Promise.resolve();
          },
        },
      },
    },

    advanced: {
      cookiePrefix: config.isTest
        ? "pantry-test"
        : config.isProduction
          ? "pantry"
          : "pantry-dev",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction,
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
export type AuthContext = Awaited<Auth["$context"]>;
