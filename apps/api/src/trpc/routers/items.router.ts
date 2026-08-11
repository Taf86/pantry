import {
  Permission,
  addItemInput,
  checkItemInput,
  deleteItemInput,
  listItemsInput,
  uncheckItemInput,
  updateItemInput,
} from "pantry-shared";

import {
  addItem,
  checkItem,
  deleteItem,
  listItemsOfList,
  uncheckItem,
  updateItem,
} from "../../services/items.service.js";
import { listProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const itemsRouter = router({
  list: listProcedure(Permission.Read)
    .input(listItemsInput)
    .query(({ ctx, input }) =>
      listItemsOfList(ctx, input.listId, input.includeDeleted),
    ),

  add: listProcedure(Permission.Write)
    .input(addItemInput)
    .mutation(({ ctx, input }) => addItem(ctx, ctx.user.id, input)),

  update: listProcedure(Permission.Write)
    .input(updateItemInput)
    .mutation(({ ctx, input }) => updateItem(ctx, ctx.user.id, input)),

  // Spuntare non richiede `Write`: è esattamente la distinzione che rende
  // sensato condividere una lista con chi deve solo fare la spesa.
  check: listProcedure(Permission.Shop)
    .input(checkItemInput)
    .mutation(({ ctx, input }) => checkItem(ctx, ctx.user.id, input)),

  uncheck: listProcedure(Permission.Shop)
    .input(uncheckItemInput)
    .mutation(({ ctx, input }) => uncheckItem(ctx, ctx.user.id, input)),

  delete: listProcedure(Permission.Write)
    .input(deleteItemInput)
    .mutation(({ ctx, input }) => deleteItem(ctx, ctx.user.id, input)),
});
