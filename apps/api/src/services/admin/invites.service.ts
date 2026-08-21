import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  INVITE_TTL_DAYS,
  serializeDates,
  type AcceptInviteInput,
  type InviteLink,
  type InvitePreview,
  type PreviewInviteInput,
} from "@pantry/shared";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import type { Database, Executor } from "../../db/client.js";
import { invites } from "../../db/schema/invites.js";
import { users } from "../../db/schema/users.js";
import { TRPCError } from "@trpc/server";
import type { Auth } from "../../auth.js";
import { accounts } from "../../db/schema/accounts.js";

export const issueInviteTx = async (
  tx: Executor,
  userId: string,
  createdBy: string,
): Promise<InviteLink> => {
  await tx
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.userId, userId), isNull(invites.usedAt)));

  const token = generateToken();
  const expiresAt = expiryFromNow();

  await tx.insert(invites).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    createdBy,
    expiresAt,
  });

  return { userId, token, expiresAt: expiresAt.toISOString() };
};

export const previewInvite = async (
  { db }: { db: Database },
  input: PreviewInviteInput,
): Promise<InvitePreview> => {
  const { token } = input;
  const [row] = await db
    .select({
      email: users.email,
      displayName: users.displayName,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.userId))
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.usedAt),
        gt(invites.expiresAt, new Date()),
        ne(users.status, "suspended"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Expired or invalid invite",
    });
  }

  return serializeDates(row);
};
export interface InviteDeps {
  db: Database;
  auth: Auth;
}

export const acceptInvite = async (
  deps: InviteDeps,
  input: AcceptInviteInput,
): Promise<{ email: string }> => {
  const authContext = await deps.auth.$context;
  const passwordHash = await authContext.password.hash(input.password);
  const tokenHash = hashToken(input.token);

  return deps.db.transaction(async (tx) => {
    const [invite] = await tx
      .update(invites)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(invites.tokenHash, tokenHash),
          isNull(invites.usedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!invite) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invito non valido o scaduto",
      });
    }

    const [user] = await tx
      .update(users)
      .set({ status: "active", emailVerified: true, updatedAt: new Date() })
      .where(and(eq(users.id, invite.userId), ne(users.status, "suspended")))
      .returning({ email: users.email });

    if (!user) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Suspended account",
      });
    }

    const [existing] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, invite.userId),
          eq(accounts.providerId, CREDENTIAL_PROVIDER),
          eq(accounts.issuer, CREDENTIAL_ISSUER),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, existing.id));
    } else {
      await tx.insert(accounts).values({
        id: randomUUID(),
        userId: invite.userId,
        accountId: invite.userId,
        providerId: CREDENTIAL_PROVIDER,
        issuer: CREDENTIAL_ISSUER,
        password: passwordHash,
      });
    }

    return { email: user.email };
  });
};

const CREDENTIAL_PROVIDER = "credential";
const CREDENTIAL_ISSUER = "local:credential";
const MS_PER_DAY = 86_400_000;
const generateToken = (): string => randomBytes(32).toString("base64url");
const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const expiryFromNow = (): Date =>
  new Date(Date.now() + INVITE_TTL_DAYS * MS_PER_DAY);
