import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const signIn = (email: string, password: string) =>
  authClient.signIn.email({ email, password });

export const signOut = () => authClient.signOut();
