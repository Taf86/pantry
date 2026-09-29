import {
  createListInputSchema,
  deleteListInputSchema,
  findMemberInputSchema,
  leaveListInputSchema,
  listIdInputSchema,
  removeMemberInputSchema,
  setMemberInputSchema,
  updateListInputSchema,
} from "@pantry/shared";

import {
  createList,
  deleteList,
  findMemberCandidate,
  getList,
  leaveList,
  listLists,
  removeMember,
  setMember,
  updateList,
} from "../../services/lists/lists.service.js";
import { authedProcedure, rateLimited, router } from "../trpc.js";

/**
 * Permissions are checked by the services, inside the transaction that acts
 * on them; a check here, outside it, could pass on a grant revoked a moment
 * later.
 */
export const listsRouter = router({
  list: authedProcedure.query(({ ctx }) => listLists(ctx, ctx.user.id)),

  get: authedProcedure
    .input(listIdInputSchema)
    .query(({ ctx, input }) => getList(ctx, input.listId, ctx.user.id)),

  create: authedProcedure
    .input(createListInputSchema)
    .mutation(({ ctx, input }) => createList(ctx, ctx.user.id, input)),

  update: authedProcedure
    .input(updateListInputSchema)
    .mutation(({ ctx, input }) => updateList(ctx, ctx.user.id, input)),

  delete: authedProcedure
    .input(deleteListInputSchema)
    .mutation(({ ctx, input }) => deleteList(ctx, ctx.user.id, input)),

  members: router({
    // Rate limited because it answers "does this email have an account?".
    find: authedProcedure
      .use(rateLimited((ctx) => ctx.limits.procedure))
      .input(findMemberInputSchema)
      .query(({ ctx, input }) => findMemberCandidate(ctx, ctx.user.id, input)),

    set: authedProcedure
      .input(setMemberInputSchema)
      .mutation(({ ctx, input }) => setMember(ctx, ctx.user.id, input)),

    remove: authedProcedure
      .input(removeMemberInputSchema)
      .mutation(({ ctx, input }) => removeMember(ctx, ctx.user.id, input)),

    leave: authedProcedure
      .input(leaveListInputSchema)
      .mutation(({ ctx, input }) => leaveList(ctx, ctx.user.id, input)),
  }),
});
