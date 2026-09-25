import {
  Permission,
  addItemInputSchema,
  deleteItemInputSchema,
  listItemsInputSchema,
  updateItemInputSchema,
} from "@pantry/shared";

import {
  addItem,
  deleteItem,
  listItemsOf,
  updateItem,
} from "../../services/lists/items.service.js";
import { listProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const itemsRouter = router({
  list: listProcedure(Permission.Read)
    .input(listItemsInputSchema)
    .query(({ ctx, input }) => listItemsOf(ctx, input)),

  add: listProcedure(Permission.Write)
    .input(addItemInputSchema)
    .mutation(({ ctx, input }) => addItem(ctx, ctx.user.id, input)),

  update: listProcedure(Permission.Write)
    .input(updateItemInputSchema)
    .mutation(({ ctx, input }) => updateItem(ctx, ctx.user.id, input)),

  delete: listProcedure(Permission.Write)
    .input(deleteItemInputSchema)
    .mutation(({ ctx, input }) => deleteItem(ctx, ctx.user.id, input)),
});
