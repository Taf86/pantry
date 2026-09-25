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
import { catalogForList } from "../../services/lists/products.service.js";
import { listProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const itemsRouter = router({
  list: listProcedure(Permission.Read)
    .input(listItemsInputSchema)
    .query(({ ctx, input }) => listItemsOf(ctx, input)),

  /**
   * The suggestion source. Shipped whole rather than searched server-side,
   * because the ranking has to run with no network.
   */
  catalog: listProcedure(Permission.Read).query(({ ctx, input }) =>
    catalogForList(ctx.db, input.listId),
  ),

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
