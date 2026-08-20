import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { userRoleSchema, userStatusSchema } from "@pantry/shared";
import type { User, UserRole, UserStatus } from "@pantry/shared";
import type { AppServices } from "../context.js";

export interface RequestContext extends AppServices {
  user: User | null;
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

export const resolveUser = async (
  services: AppServices,
  headers: Headers,
): Promise<User | null> => {
  const session = await services.auth.api.getSession({ headers });
  if (!session?.user) return null;
  return toUser(session.user);
};

export const createContextFactory =
  (services: AppServices) =>
  async ({ req }: CreateFastifyContextOptions): Promise<RequestContext> => {
    const headers = toHeaders(req.headers);
    return { ...services, headers, user: await resolveUser(services, headers) };
  };
