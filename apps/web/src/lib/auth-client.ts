import { createAuthClient } from "better-auth/react";

/**
 * Login e logout restano a Better Auth. Tutto il resto passa da tRPC.
 *
 * Nessun `baseURL`: frontend e API stanno sulla stessa origin, che è il
 * presupposto dell'intero modello di autenticazione — cookie `httpOnly` senza
 * CORS, e handshake WebSocket autenticato senza header custom.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const signIn = (email: string, password: string) =>
  authClient.signIn.email({ email, password });

export const signOut = () => authClient.signOut();
