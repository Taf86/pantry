import {
  pushEndpointInputSchema,
  pushSubscriptionInputSchema,
  type PushConfigResult,
} from "@pantry/shared";

import {
  registerSubscription,
  removeSubscription,
} from "../../services/push/push.service.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

export const pushRouter = router({
  config: adminProcedure.query(({ ctx }): PushConfigResult => ({
    publicKey: ctx.config.push?.publicKey ?? null,
  })),
  subscribe: adminProcedure
    .input(pushSubscriptionInputSchema)
    .mutation(({ ctx, input }) =>
      registerSubscription(ctx, ctx.user.id, input),
    ),
  unsubscribe: authedProcedure
    .input(pushEndpointInputSchema)
    .mutation(({ ctx, input }) =>
      removeSubscription(ctx, ctx.user.id, input.endpoint),
    ),
});
