import { acceptInviteInput } from "pantry-shared";
import { z } from "zod";

import { searchActiveUsers } from "../../services/admin.service.js";
import { acceptInvite, previewInvite } from "../../services/invites.service.js";
import { listCategories } from "../../services/shopping.service.js";
import { authedProcedure, publicProcedure, router } from "../trpc.js";

/**
 * Ciò che riguarda l'utente corrente e l'onboarding.
 *
 * Login e logout restano a Better Auth su `/api/auth/*`: qui c'è solo quello
 * che Better Auth non fa, cioè il flusso a inviti che sostituisce le email.
 */
export const accountRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  invitePreview: publicProcedure
    .input(z.object({ token: z.string().min(16).max(256) }))
    .query(({ ctx, input }) => previewInvite(ctx.db, input.token)),

  acceptInvite: publicProcedure
    .input(acceptInviteInput)
    .mutation(({ ctx, input }) => acceptInvite(ctx, input)),

  /** Categorie: dato di riferimento, letto una volta e tenuto in cache. */
  categories: publicProcedure.query(({ ctx }) => listCategories(ctx)),

  /** Ricerca utenti per la UI di condivisione. */
  searchUsers: authedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(64) }))
    .query(({ ctx, input }) => searchActiveUsers(ctx, input.query, 10)),
});
