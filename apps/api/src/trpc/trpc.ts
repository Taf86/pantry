import { TRPCError, initTRPC } from "@trpc/server";
import { ZodError } from "zod";

import type { RequestContext } from "./context.js";

const t = initTRPC.context<RequestContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        /** Gli errori di validazione arrivano al client già strutturati. */
        zod:
          error.cause instanceof ZodError
            ? error.cause.flatten().fieldErrors
            : null,
        /** Stato corrente allegato ai conflitti di versione (§6). */
        conflict:
          error.code === "CONFLICT" && error.cause !== undefined
            ? error.cause
            : null,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Un utente autenticato ma non `active` non passa: un account ancora da
 * attivare o sospeso ha comunque un cookie valido finché non scade, e non è
 * il cookie a decidere l'autorizzazione.
 */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessione assente" });
  }
  if (ctx.user.status !== "active") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        ctx.user.status === "suspended"
          ? "Account sospeso"
          : "Account non ancora attivato",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Nascondere la voce di menu non è autorizzazione: il ruolo si verifica qui,
 * lato server, per ogni procedura `admin.*`.
 */
export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Riservato agli amministratori",
    });
  }
  return next();
});
