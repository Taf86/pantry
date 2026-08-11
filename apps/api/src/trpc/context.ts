import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { SessionUser, UserRole, UserStatus } from "pantry-shared";

import type { AppServices } from "../context.js";

export interface RequestContext extends AppServices {
  user: SessionUser | null;
  /** Header della richiesta: servono a Better Auth per leggere il cookie. */
  headers: Headers;
}

const toHeaders = (
  raw: Record<string, string | string[] | undefined>,
): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      headers.append(key, entry);
    }
  }
  return headers;
};

/**
 * Better Auth restituisce l'utente con i campi aggiuntivi come `unknown`:
 * qui li richiudiamo nel tipo di dominio, con un default prudente.
 */
const asRole = (value: unknown): UserRole =>
  value === "admin" ? "admin" : "user";

const asStatus = (value: unknown): UserStatus =>
  value === "active" || value === "suspended" ? value : "invited";

const toSessionUser = (user: {
  id: string;
  email: string;
  name: string;
  role?: unknown;
  status?: unknown;
}): SessionUser => ({
  id: user.id,
  email: user.email,
  displayName: user.name,
  role: asRole(user.role),
  status: asStatus(user.status),
});

/**
 * Ogni richiesta fa una lettura di sessione su Postgres. A questa scala è
 * irrilevante, e in cambio la revoca è istantanea: sospendere un utente dal
 * backoffice ha effetto sulla richiesta successiva.
 */
export const resolveUser = async (
  services: AppServices,
  headers: Headers,
): Promise<SessionUser | null> => {
  const session = await services.auth.api.getSession({ headers });
  if (!session?.user) return null;
  return toSessionUser(session.user);
};

export const createContextFactory =
  (services: AppServices) =>
  async ({ req }: CreateFastifyContextOptions): Promise<RequestContext> => {
    const headers = toHeaders(req.headers);
    return { ...services, headers, user: await resolveUser(services, headers) };
  };
