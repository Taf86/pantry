import {
  Permission,
  claimSessionInputSchema,
  heartbeatInputSchema,
  releaseSessionInputSchema,
} from "@pantry/shared";

import {
  activeSession,
  claimSession,
  heartbeatSession,
  releaseSession,
} from "../../services/shopping/sessions.service.js";
import { listProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/**
 * Taking a list in charge.
 *
 * All three writes are online-only by nature and carry no mutation id: who
 * holds a lease is a consensus question, and a claim that sat in the offline
 * queue would fire from the car park an hour later and take the list from
 * whoever holds it by then.
 *
 * Note what is NOT here: nothing in this router gates `items.check`.
 * `Permission.Shop` alone authorizes ticking, so a shopper whose lease expired
 * while they were offline still drains their queue on the way home.
 */
export const shoppingRouter = router({
  active: listProcedure(Permission.Read).query(({ ctx, input }) =>
    activeSession(ctx.db, input.listId),
  ),

  claim: listProcedure(Permission.Shop)
    .input(claimSessionInputSchema)
    .mutation(({ ctx, input }) => claimSession(ctx, ctx.user.id, input)),

  heartbeat: listProcedure(Permission.Shop)
    .input(heartbeatInputSchema)
    .mutation(({ ctx, input }) => heartbeatSession(ctx, ctx.user.id, input)),

  release: listProcedure(Permission.Shop)
    .input(releaseSessionInputSchema)
    .mutation(({ ctx, input }) => releaseSession(ctx, ctx.user.id, input)),
});
