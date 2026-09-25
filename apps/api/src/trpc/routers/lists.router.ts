import {
  Permission,
  createListInputSchema,
  deleteListInputSchema,
  leaveListInputSchema,
  removeMemberInputSchema,
  setMemberInputSchema,
  updateListInputSchema,
} from "@pantry/shared";

import {
  createList,
  deleteList,
  getList,
  leaveList,
  listLists,
  removeMember,
  setMember,
  updateList,
} from "../../services/lists/lists.service.js";
import { listProcedure } from "../procedures.js";
import { authedProcedure, router } from "../trpc.js";

export const listsRouter = router({
  list: authedProcedure.query(({ ctx }) => listLists(ctx, ctx.user.id)),

  get: listProcedure(Permission.Read).query(({ ctx, input }) =>
    getList(ctx, input.listId, ctx.user.id),
  ),

  create: authedProcedure
    .input(createListInputSchema)
    .mutation(({ ctx, input }) => createList(ctx, ctx.user.id, input)),

  update: listProcedure(Permission.Write)
    .input(updateListInputSchema)
    .mutation(({ ctx, input }) => updateList(ctx, ctx.user.id, input)),

  delete: listProcedure(Permission.Manage)
    .input(deleteListInputSchema)
    .mutation(({ ctx, input }) => deleteList(ctx, ctx.user.id, input)),

  members: router({
    set: listProcedure(Permission.Manage)
      .input(setMemberInputSchema)
      .mutation(({ ctx, input }) => setMember(ctx, ctx.user.id, input)),

    remove: listProcedure(Permission.Manage)
      .input(removeMemberInputSchema)
      .mutation(({ ctx, input }) => removeMember(ctx, ctx.user.id, input)),

    // Leaving is not managing: Read is the right bar for showing yourself out.
    leave: listProcedure(Permission.Read)
      .input(leaveListInputSchema)
      .mutation(({ ctx, input }) => leaveList(ctx, ctx.user.id, input)),
  }),
});
