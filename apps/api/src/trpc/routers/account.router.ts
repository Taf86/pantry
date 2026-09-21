import {
  previewInviteInputSchema,
  acceptInviteInputSchema,
  createRequestInputSchema,
} from "@pantry/shared";

import {
  acceptInvite,
  previewInvite,
} from "../../services/admin/invites.service.js";
import { createRequest } from "../../services/admin/requests.service.js";
import { publicProcedure, router } from "../trpc.js";

export const accountRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  invitePreview: publicProcedure
    .input(previewInviteInputSchema)
    .query(({ ctx, input }) => previewInvite(ctx, input)),

  acceptInvite: publicProcedure
    .input(acceptInviteInputSchema)
    .mutation(({ ctx, input }) => acceptInvite(ctx, input)),

  // The only unauthenticated write: it queues a signup or a password reset for
  // an admin to decide on, and answers the same way whatever the address is.
  createRequest: publicProcedure
    .input(createRequestInputSchema)
    .mutation(({ ctx, input }) => createRequest(ctx, input)),
});
