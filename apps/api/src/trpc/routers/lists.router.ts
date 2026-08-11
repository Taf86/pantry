import {
  Permission,
  createListInput,
  deleteListInput,
  shareListInput,
  unshareListInput,
  updateListInput,
} from "pantry-shared";

import {
  createList,
  deleteList,
  getListDetail,
  listUserLists,
  shareList,
  unshareList,
  updateList,
} from "../../services/lists.service.js";
import { listProcedure } from "../procedures.js";
import { authedProcedure, router } from "../trpc.js";

export const listsRouter = router({
  list: authedProcedure.query(({ ctx }) => listUserLists(ctx, ctx.user.id)),

  get: listProcedure(Permission.Read).query(({ ctx, input }) =>
    getListDetail(ctx, input.listId, ctx.permissions),
  ),

  create: authedProcedure
    .input(createListInput)
    .mutation(({ ctx, input }) => createList(ctx, ctx.user.id, input)),

  update: listProcedure(Permission.Write)
    .input(updateListInput)
    .mutation(({ ctx, input }) =>
      updateList(ctx, ctx.user.id, ctx.permissions, input),
    ),

  delete: listProcedure(Permission.Write)
    .input(deleteListInput)
    .mutation(({ ctx, input }) => deleteList(ctx, ctx.user.id, input)),

  share: listProcedure(Permission.Manage)
    .input(shareListInput)
    .mutation(({ ctx, input }) =>
      shareList(ctx, ctx.user.id, ctx.permissions, input),
    ),

  unshare: listProcedure(Permission.Manage)
    .input(unshareListInput)
    .mutation(({ ctx, input }) =>
      unshareList(ctx, ctx.user.id, ctx.permissions, input),
    ),
});
