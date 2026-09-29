import {
  claimSessionInputSchema,
  heartbeatInputSchema,
  listIdInputSchema,
  releaseSessionInputSchema,
} from "@pantry/shared";

import {
  activeSession,
  claimSession,
  heartbeatSession,
  releaseSession,
} from "../../services/shopping/sessions.service.js";
import { authedProcedure, router } from "../trpc.js";

/**
 * Taking a list in charge.
 *
 * All three writes are online-only by nature and carry no mutation id: who
 * holds a lease is a consensus question, and a claim that sat in the offline
 * queue would fire from the car park an hour later and take the list from
 * whoever holds it by then.
 *
 * Permissions are checked by the service: Read to see the lease, Shop to take
 * or renew it, nothing to hand it back. Note also what is NOT here: nothing in
 * this router gates `items.check`. `Permission.Shop` alone authorizes ticking,
 * so a shopper whose lease expired while they were offline still drains their
 * queue on the way home.
 */
export const shoppingRouter = router({
  active: authedProcedure
    .input(listIdInputSchema)
    .query(({ ctx, input }) =>
      activeSession(ctx.db, input.listId, ctx.user.id),
    ),

  claim: authedProcedure
    .input(claimSessionInputSchema)
    .mutation(({ ctx, input }) => claimSession(ctx, ctx.user.id, input)),

  heartbeat: authedProcedure
    .input(heartbeatInputSchema)
    .mutation(({ ctx, input }) => heartbeatSession(ctx, ctx.user.id, input)),

  release: authedProcedure
    .input(releaseSessionInputSchema)
    .mutation(({ ctx, input }) => releaseSession(ctx, ctx.user.id, input)),
});
