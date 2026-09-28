import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { userRoleSchema, userStatusSchema } from "@pantry/shared";
import type { User, UserRole, UserStatus } from "@pantry/shared";
import type { AppServices } from "../context.js";

export interface RequestContext extends AppServices {
  user: User | null;
  headers: Headers;
  clientIp: string;
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

const asRole = (value: unknown): UserRole =>
  userRoleSchema.catch("user").parse(value);

const asStatus = (value: unknown): UserStatus =>
  userStatusSchema.catch("unactivated").parse(value);

const toUser = (user: {
  id: string;
  email: string;
  name: string;
  role?: unknown;
  status?: unknown;
}): User => ({
  id: user.id,
  email: user.email,
  displayName: user.name,
  role: asRole(user.role),
  status: asStatus(user.status),
});

export interface ResolvedSession {
  user: User;
  sessionId: string;
  expiresAt: Date;
}

/**
 * `refresh: false` checks the session without extending it. The socket needs
 * that: it cannot carry the refreshed cookie back to the browser, and an open
 * socket must not keep a session alive that the user has stopped using.
 */
export const resolveSession = async (
  services: AppServices,
  headers: Headers,
  { refresh = true }: { refresh?: boolean } = {},
): Promise<ResolvedSession | null> => {
  const session = await services.auth.api.getSession({
    headers,
    query: { disableRefresh: !refresh },
  });
  if (!session?.user) return null;
  return {
    user: toUser(session.user),
    sessionId: session.session.id,
    expiresAt: new Date(session.session.expiresAt),
  };
};

export const resolveUser = async (
  services: AppServices,
  headers: Headers,
): Promise<User | null> =>
  (await resolveSession(services, headers))?.user ?? null;

export const createContextFactory =
  (services: AppServices) =>
  async ({ req }: CreateFastifyContextOptions): Promise<RequestContext> => {
    const headers = toHeaders(req.headers);
    return {
      ...services,
      headers,
      clientIp: req.ip,
      user: await resolveUser(services, headers),
    };
  };
