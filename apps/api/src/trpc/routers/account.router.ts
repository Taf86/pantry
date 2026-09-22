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
import { hashClientIp } from "../../server/rate-limit.js";
import { publicProcedure, rateLimited, router } from "../trpc.js";

export const accountRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  invitePreview: publicProcedure
    .input(previewInviteInputSchema)
    .query(({ ctx, input }) => previewInvite(ctx, input)),

  acceptInvite: publicProcedure
    .input(acceptInviteInputSchema)
    .mutation(({ ctx, input }) => acceptInvite(ctx, input)),

  createRequest: publicProcedure
    .use(rateLimited((ctx) => ctx.limits.createRequest))
    .use(
      rateLimited(
        (ctx) => ctx.limits.createRequestGlobal,
        () => "all",
      ),
    )
    .input(createRequestInputSchema)
    .mutation(({ ctx, input }) =>
      createRequest(
        {
          ...ctx,
          requesterHash: hashClientIp(
            ctx.clientIp,
            ctx.config.BETTER_AUTH_SECRET,
          ),
        },
        input,
      ),
    ),
});
