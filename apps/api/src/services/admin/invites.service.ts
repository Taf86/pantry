import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  INVITE_RETENTION_DAYS,
  INVITE_TTL_DAYS,
  serializeDates,
  type AcceptInviteInput,
  type InviteExtended,
  type InviteLink,
  type InvitePreview,
  type InviteSort,
  type InviteSortField,
  type ListInvitesInput,
  type ListInvitesResult,
  type PreviewInviteInput,
} from "@pantry/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  lt,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";

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

export const listInvites = async (
  deps: InviteListDeps,
  input: ListInvitesInput,
): Promise<ListInvitesResult> => {
  const { pageIndex, pageSize } = input.pagination;

  const [rows, rowCount] = await Promise.all([
    deps.db
      .select(inviteSelection)
      .from(invites)
      .innerJoin(users, eq(users.id, invites.userId))
      .innerJoin(creators, eq(creators.id, invites.createdBy))
      .orderBy(...buildInviteOrder(input.sorting))
      .limit(pageSize)
      .offset(pageIndex * pageSize),
    countInvites(deps),
  ]);

  return { rows: rows.map(serializeDates), rowCount };
};

export const requireInvite = async (
  deps: InviteListDeps,
  inviteId: string,
): Promise<InviteExtended> => {
  const [row] = await deps.db
    .select(inviteSelection)
    .from(invites)
    .innerJoin(users, eq(users.id, invites.userId))
    .innerJoin(creators, eq(creators.id, invites.createdBy))
    .where(eq(invites.id, inviteId))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invite not existing." });
  }
  return serializeDates(row);
};

export const deleteInvite = async (
  deps: InviteListDeps,
  inviteId: string,
): Promise<InviteExtended> => {
  const invite = await requireInvite(deps, inviteId);
  await deps.db.delete(invites).where(eq(invites.id, inviteId));
  return invite;
};

export const sweepStaleInvites = async (db: Database): Promise<number> => {
  const cutoff = new Date(Date.now() - INVITE_RETENTION_DAYS * MS_PER_DAY);

  const removed = await db
    .delete(invites)
    .where(or(lt(invites.usedAt, cutoff), lt(invites.expiresAt, cutoff)))
    .returning({ id: invites.id });

  return removed.length;
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
        message: "Expired or invalid link",
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

interface InviteListDeps {
  db: Database;
}

// The invite points at two users: the one it was addressed to and the one who
// issued it, so the users table joins twice and the second join needs an alias.
const creators = alias(users, "creators");

const inviteSelection = {
  id: invites.id,
  user: {
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    status: users.status,
  },
  createdBy: {
    id: creators.id,
    email: creators.email,
    displayName: creators.displayName,
  },
  usedAt: invites.usedAt,
  expiresAt: invites.expiresAt,
  createdAt: invites.createdAt,
};

const sortableColumns = {
  user: users.displayName,
  usedAt: invites.usedAt,
  expiresAt: invites.expiresAt,
  createdBy: creators.displayName,
} satisfies Record<InviteSortField, PgColumn>;

const buildInviteOrder = (sorting: InviteSort[]): SQL[] => {
  const order = sorting.map((sort) =>
    sort.desc ? desc(sortableColumns[sort.id]) : asc(sortableColumns[sort.id]),
  );
  return order.length > 0
    ? [...order, asc(invites.id)]
    : [desc(invites.createdAt), asc(invites.id)];
};

const countInvites = async (deps: InviteListDeps) => {
  const [row] = await deps.db.select({ value: count() }).from(invites);
  return row?.value ?? 0;
};

const CREDENTIAL_PROVIDER = "credential";
const CREDENTIAL_ISSUER = "local:credential";
const MS_PER_DAY = 86_400_000;
const generateToken = (): string => randomBytes(32).toString("base64url");
const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const expiryFromNow = (): Date =>
  new Date(Date.now() + INVITE_TTL_DAYS * MS_PER_DAY);
