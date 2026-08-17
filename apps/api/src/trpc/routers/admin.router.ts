import {
  createUserInput,
  signupRequestIdSchema,
  userIdSchema,
  userRoleSchema,
  userStatusSchema,
} from "pantry-shared";
import { z } from "zod";

import {
  createUser,
  listUsers,
  regenerateInvite,
  setRole,
  setStatus,
} from "../../services/admin.service.js";
import {
  approveSignupRequest,
  listOpenSignupRequests,
  rejectSignupRequest,
} from "../../services/signup.service.js";
import { adminProcedure, router } from "../trpc.js";

/**
 * Ogni procedura passa da `adminProcedure`, che verifica `role === 'admin'`
 * lato server. Nascondere la UI non è autorizzazione.
 */
export const adminRouter = router({
  users: router({
    list: adminProcedure.query(({ ctx }) => listUsers(ctx)),

    /** Restituisce il token in chiaro: unica occasione in cui esiste. */
    create: adminProcedure
      .input(createUserInput)
      .mutation(({ ctx, input }) => createUser(ctx, ctx.user.id, input)),

    regenerateInvite: adminProcedure
      .input(z.object({ userId: userIdSchema }))
      .mutation(({ ctx, input }) =>
        regenerateInvite(ctx, ctx.user.id, input.userId),
      ),

    setStatus: adminProcedure
      .input(z.object({ userId: userIdSchema, status: userStatusSchema }))
      .mutation(({ ctx, input }) =>
        setStatus(ctx, ctx.user.id, input.userId, input.status),
      ),

    setRole: adminProcedure
      .input(z.object({ userId: userIdSchema, role: userRoleSchema }))
      .mutation(({ ctx, input }) =>
        setRole(ctx, ctx.user.id, input.userId, input.role),
      ),
  }),

  /**
   * Le richieste di registrazione da evadere.
   *
   * `approve` restituisce la stessa forma di `users.create` — utente più link
   * di invito — perché è letteralmente lo stesso lavoro: la UI riusa la modale
   * del link senza sapere da dove è arrivata la creazione.
   */
  signupRequests: router({
    list: adminProcedure.query(({ ctx }) => listOpenSignupRequests(ctx)),

    approve: adminProcedure
      .input(z.object({ requestId: signupRequestIdSchema }))
      .mutation(({ ctx, input }) =>
        approveSignupRequest(ctx, ctx.user.id, input.requestId),
      ),

    reject: adminProcedure
      .input(z.object({ requestId: signupRequestIdSchema }))
      .mutation(({ ctx, input }) =>
        rejectSignupRequest(ctx, ctx.user.id, input.requestId),
      ),
  }),
});
