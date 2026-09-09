import { createAuthClient } from "better-auth/react";
import z from "zod";

export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const signIn = (email: string, password: string) =>
  authClient.signIn.email({ email, password });

export const signOut = () => authClient.signOut();

type AuthErrorCode = keyof typeof authClient.$ERROR_CODES;

type AuthErrorCodeRecord<K extends AuthErrorCode = AuthErrorCode> = Partial<
  Record<K, K>
>;

const AUTH_ERROR = {
  INVALID_EMAIL_OR_PASSWORD: "INVALID_EMAIL_OR_PASSWORD",
} as const satisfies AuthErrorCodeRecord;

const authErrorSchema = z.object({
  code: z.enum(AUTH_ERROR),
});

export type AuthError = z.infer<typeof authErrorSchema>;

export function isAuthError(error: unknown): AuthError | null {
  const result = authErrorSchema.safeParse(error);
  return result.data || null;
}

export function authErrorKey(error: AuthError) {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "error.auth.invalidCredentials" as const;
  }
}
