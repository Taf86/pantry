import {
  previewInviteInputSchema,
  acceptInviteInputSchema,
} from "@pantry/shared";

import {
  acceptInvite,
  previewInvite,
} from "../../services/admin/invites.service.js";
import { publicProcedure, router } from "../trpc.js";

export const accountRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  invitePreview: publicProcedure
    .input(previewInviteInputSchema)
    .query(({ ctx, input }) => previewInvite(ctx, input)),

  acceptInvite: publicProcedure
    .input(acceptInviteInputSchema)
    .mutation(({ ctx, input }) => acceptInvite(ctx, input)),
});
