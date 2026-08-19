import { randomUUID, timingSafeEqual } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, lt, ne } from "drizzle-orm";
import {
  MAX_OPEN_SIGNUP_REQUESTS,
  SIGNUP_REQUEST_TTL_DAYS,
  signupRequestStatusSchema,
  type AdminUser,
  type InviteLink,
  type SignupInfo,
  type SignupRequest,
  type SignupRequestInput,
} from "pantry-shared";

import type { Database } from "../db/client.js";
import { users } from "../db/schema/auth.js";
import { signupRequests } from "../db/schema/signup.js";
import type { AppConfig } from "../env.js";
import { createUserTx, requireUser } from "./admin.service.js";

const MS_PER_DAY = 86_400_000;

export interface SignupDeps {
  db: Database;
  config: AppConfig;
}

export interface SignupAdminDeps {
  db: Database;
}

const toSignupRequest = (row: {
  id: string;
  email: string;
  displayName: string;
  contact: string;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}): SignupRequest => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  contact: row.contact,
  // Lo stato arriva da una colonna di testo: si richiude nel tipo di dominio
  // passando dallo schema, così un valore nuovo non può travestirsi da altro.
  status: signupRequestStatusSchema.catch("pending").parse(row.status),
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  decidedBy: row.decidedBy,
});

const selection = {
  id: signupRequests.id,
  email: signupRequests.email,
  displayName: signupRequests.displayName,
  contact: signupRequests.contact,
  status: signupRequests.status,
  decidedBy: signupRequests.decidedBy,
  decidedAt: signupRequests.decidedAt,
  createdAt: signupRequests.createdAt,
};

/** Ciò che la pagina di login può sapere senza essere autenticata. */
export const signupInfo = (deps: SignupDeps): SignupInfo => ({
  open: deps.config.SIGNUP_ENABLED,
  requiresCode: deps.config.SIGNUP_CODE !== undefined,
});

/** Confronto a tempo costante: il codice è corto, e non serve regalare indizi. */
const codeMatches = (
  expected: string,
  provided: string | undefined,
): boolean => {
  const candidate = Buffer.from(provided ?? "", "utf8");
  const reference = Buffer.from(expected, "utf8");
  return (
    candidate.length === reference.length &&
    timingSafeEqual(candidate, reference)
  );
};

/**
 * Richiesta di registrazione: l'unica scrittura pubblica non autenticata.
 *
 * Fa un solo INSERT, e questo è deliberato — nessun hash di password su una
 * rotta anonima, che sarebbe amplificazione di CPU regalata a chiunque.
 *
 * La risposta è **sempre la stessa**, che l'indirizzo sia libero, già utente o
 * già in coda: un esito diverso trasformerebbe la rotta in un oracolo su quali
 * email esistono, la stessa ragione per cui il login non dice quale dei due
 * campi è sbagliato.
 */
export const requestSignup = async (
  deps: SignupDeps,
  input: SignupRequestInput,
): Promise<{ ok: true }> => {
  if (!deps.config.SIGNUP_ENABLED) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Le richieste di registrazione sono chiuse",
    });
  }

  const expectedCode = deps.config.SIGNUP_CODE;
  if (expectedCode !== undefined && !codeMatches(expectedCode, input.code)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Codice di registrazione non valido",
    });
  }

  const [open] = await deps.db
    .select({ value: count() })
    .from(signupRequests)
    .where(eq(signupRequests.status, "pending"));

  if ((open?.value ?? 0) >= MAX_OPEN_SIGNUP_REQUESTS) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Troppe richieste in attesa: riprova più tardi",
    });
  }

  const [existingUser] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Chi è già un utente non deve accodarsi, e non deve nemmeno scoprirlo.
  if (!existingUser) {
    // `DO NOTHING` senza target copre qualunque vincolo: con l'indice parziale
    // su `email WHERE status = 'pending'`, una seconda richiesta aperta scivola
    // via senza errore invece di rivelare che la prima esiste.
    await deps.db
      .insert(signupRequests)
      .values({
        id: randomUUID(),
        email: input.email,
        displayName: input.displayName,
        contact: input.contact,
      })
      .onConflictDoNothing();
  }

  return { ok: true };
};

/**
 * La coda del backoffice: solo le richieste aperte.
 *
 * Lo storico resta in tabella per l'audit finché il job di pulizia non lo
 * spazza, ma non è quello che serve guardare per lavorare.
 */
export const listOpenSignupRequests = async (
  deps: SignupAdminDeps,
): Promise<SignupRequest[]> => {
  const rows = await deps.db
    .select(selection)
    .from(signupRequests)
    .where(eq(signupRequests.status, "pending"))
    .orderBy(asc(signupRequests.createdAt));

  return rows.map(toSignupRequest);
};

/**
 * Approvazione: la richiesta diventa un utente `unactivated` con il suo link.
 *
 * L'ordine è quello che conta. Si decide **prima** e si crea dopo, con un
 * `UPDATE ... WHERE status = 'pending' RETURNING`: due approvazioni concorrenti
 * non possono produrre due utenti. E poiché tutto sta in una transazione, un
 * fallimento della creazione — l'email diventata utente nel frattempo —
 * rimette la richiesta in coda invece di consumarla a vuoto.
 */
export const approveSignupRequest = async (
  deps: SignupAdminDeps,
  actorId: string,
  requestId: string,
): Promise<{ user: AdminUser; invite: InviteLink }> => {
  const invite = await deps.db.transaction(async (tx) => {
    const [request] = await tx
      .update(signupRequests)
      .set({
        status: "approved",
        decidedBy: actorId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(signupRequests.id, requestId),
          eq(signupRequests.status, "pending"),
        ),
      )
      .returning();

    if (!request) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Richiesta inesistente o già evasa",
      });
    }

    // Il ruolo non viene dalla richiesta: si nasce `user`, e l'admin promuove
    // dopo se serve. Un modulo pubblico non decide i privilegi.
    const issued = await createUserTx(tx, actorId, {
      email: request.email,
      displayName: request.displayName,
      role: "user",
    });

    await tx
      .update(signupRequests)
      .set({ userId: issued.userId })
      .where(eq(signupRequests.id, request.id));

    return issued;
  });

  return { user: await requireUser(deps, invite.userId), invite };
};

/**
 * Rifiuto: nessun utente da cancellare, perché nessuno è mai stato creato.
 *
 * La riga resta come traccia, e l'indice parziale su `email` è ristretto alle
 * richieste aperte: la persona può ri-candidarsi.
 */
export const rejectSignupRequest = async (
  deps: SignupAdminDeps,
  actorId: string,
  requestId: string,
): Promise<{ ok: true }> => {
  const [request] = await deps.db
    .update(signupRequests)
    .set({ status: "rejected", decidedBy: actorId, decidedAt: new Date() })
    .where(
      and(
        eq(signupRequests.id, requestId),
        eq(signupRequests.status, "pending"),
      ),
    )
    .returning({ id: signupRequests.id });

  if (!request) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Richiesta inesistente o già evasa",
    });
  }

  return { ok: true };
};

/** Le richieste già evase non servono a niente dopo un mese. */
export const sweepDecidedSignupRequests = async (
  db: Database,
): Promise<number> => {
  const cutoff = new Date(Date.now() - SIGNUP_REQUEST_TTL_DAYS * MS_PER_DAY);

  const deleted = await db
    .delete(signupRequests)
    .where(
      and(
        ne(signupRequests.status, "pending"),
        lt(signupRequests.decidedAt, cutoff),
      ),
    )
    .returning({ id: signupRequests.id });

  return deleted.length;
};
