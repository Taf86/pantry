import {
  createListInputSchema,
  deleteListInputSchema,
  findMemberInputSchema,
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
  getListMembers,
  getLists,
  removeMember,
  setMember,
  updateList,
} from "../../services/lists/lists.service.js";
import { authedProcedure, rateLimited, router } from "../trpc.js";

export const listsRouter = router({
  list: authedProcedure.query(({ ctx }) => getLists(ctx, ctx.user.id)),

  get: authedProcedure
    .input(listIdInputSchema)
    .query(({ ctx, input }) => getList(ctx, ctx.user.id, input.listId)),

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
    get: authedProcedure
      .input(listIdInputSchema)
      .query(({ ctx, input }) =>
        getListMembers(ctx, input.listId, ctx.user.id),
      ),

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
  }),
});
