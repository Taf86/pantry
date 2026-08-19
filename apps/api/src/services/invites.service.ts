import { createHash, randomBytes, randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import {
  INVITE_TTL_DAYS,
  type AcceptInviteInput,
  type InviteLink,
  type InvitePreview,
} from "pantry-shared";

import type { Auth } from "../auth/auth.js";
import type { Database, Executor } from "../db/client.js";
import { accounts, invites, users } from "../db/schema/auth.js";

const CREDENTIAL_PROVIDER = "credential";
const MS_PER_DAY = 86_400_000;

export interface InviteDeps {
  db: Database;
  auth: Auth;
}

/** 32 byte casuali: il token vero, che esiste solo nella risposta HTTP. */
const generateToken = (): string => randomBytes(32).toString("base64url");

/**
 * In database finisce solo lo SHA-256 del token.
 *
 * Non serve un KDF lento: il token ha 256 bit di entropia, quindi non è
 * attaccabile per forza bruta come una password. Serve invece che un dump del
 * database non consegni i link ancora validi.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const expiryFromNow = (): Date =>
  new Date(Date.now() + INVITE_TTL_DAYS * MS_PER_DAY);

/**
 * Emette un invito, bruciando quelli precedenti ancora aperti.
 *
 * Solo l'ultimo link consegnato deve funzionare: se un vecchio link riemerge
 * da una chat, non deve poter attivare l'account.
 */
export const issueInvite = async (
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

/** Anteprima pubblica: dice solo a chi appartiene il link, niente di più. */
export const previewInvite = async (
  db: Database,
  token: string,
): Promise<InvitePreview> => {
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
        // Coerente con `acceptInvite`: se il link non porterebbe a nulla, non
        // si mostra il form. Il 404 resta generico, non dice che è sospeso.
        ne(users.status, "suspended"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Invito non valido o scaduto",
    });
  }

  return {
    email: row.email,
    displayName: row.displayName,
    expiresAt: row.expiresAt.toISOString(),
  };
};

/**
 * Accettazione dell'invito: il momento in cui l'utente sceglie la password.
 *
 * Tutto sta in una transazione, compresa la scrittura della credenziale. Da
 * Better Auth prendiamo in prestito solo la funzione di hashing — che è pura —
 * proprio per non spezzare l'atomicità: un invito bruciato senza password
 * scritta lascerebbe l'utente fuori senza modo di rientrare.
 */
export const acceptInvite = async (
  deps: InviteDeps,
  input: AcceptInviteInput,
): Promise<{ email: string }> => {
  const authContext = await deps.auth.$context;
  const passwordHash = await authContext.password.hash(input.password);
  const tokenHash = hashToken(input.token);

  return deps.db.transaction(async (tx) => {
    // Il consumo dell'invito è un UPDATE condizionale: due tentativi
    // concorrenti sullo stesso link non possono riuscire entrambi.
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

    const [existing] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, invite.userId),
          eq(accounts.providerId, CREDENTIAL_PROVIDER),
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
        password: passwordHash,
      });
    }

    // Accettare un invito non può resuscitare un account sospeso: un link
    // ancora valido in mano a chi è stato sospeso sarebbe una via di rientro
    // che scavalca la decisione dell'amministratore.
    //
    // Il predicato sullo stato sta nella WHERE dell'UPDATE e non in una
    // lettura precedente: così una sospensione concorrente non può infilarsi
    // fra il controllo e la scrittura.
    const [user] = await tx
      .update(users)
      .set({ status: "active", emailVerified: true, updatedAt: new Date() })
      .where(and(eq(users.id, invite.userId), ne(users.status, "suspended")))
      .returning({ email: users.email });

    if (!user) {
      // La FK con ON DELETE CASCADE garantisce che l'utente esista finché
      // esiste il suo invito: se l'UPDATE non ha toccato nulla è stato il
      // predicato sullo stato a escludere la riga.
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Account sospeso: rivolgiti a un amministratore",
      });
    }

    return { email: user.email };
  });
};

/** Un invito è "in sospeso" se non è stato usato e non è ancora scaduto. */
export const pendingInviteCondition = sql`
  EXISTS (
    SELECT 1 FROM invites i
    WHERE i.user_id = users.id AND i.used_at IS NULL AND i.expires_at > now()
  )
`;
