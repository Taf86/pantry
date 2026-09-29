import {
  addItemInputSchema,
  checkItemInputSchema,
  checkManyInputSchema,
  deleteItemInputSchema,
  listIdInputSchema,
  listItemsInputSchema,
  uncheckItemInputSchema,
  updateItemInputSchema,
} from "@pantry/shared";

import {
  addItem,
  deleteItem,
  listItemsOf,
  updateItem,
} from "../../services/lists/items.service.js";
import {
  checkItem,
  checkMany,
  uncheckItem,
} from "../../services/lists/checks.service.js";
import { catalogForList } from "../../services/lists/products.service.js";
import { authedProcedure, router } from "../trpc.js";

/**
 * Permissions are checked by the services: Read to see, Write to change, Shop
 * to tick, each write inside the transaction that applies it. Ticking needs
 * Shop and not Write, and holding the lease is NOT required.
 */
export const itemsRouter = router({
  list: authedProcedure
    .input(listItemsInputSchema)
    .query(({ ctx, input }) => listItemsOf(ctx, ctx.user.id, input)),

  /**
   * The suggestion source. Shipped whole rather than searched server-side,
   * because the ranking has to run with no network.
   */
  catalog: authedProcedure
    .input(listIdInputSchema)
    .query(({ ctx, input }) =>
      catalogForList(ctx.db, input.listId, ctx.user.id),
    ),

  add: authedProcedure
    .input(addItemInputSchema)
    .mutation(({ ctx, input }) => addItem(ctx, ctx.user.id, input)),

  update: authedProcedure
    .input(updateItemInputSchema)
    .mutation(({ ctx, input }) => updateItem(ctx, ctx.user.id, input)),

  delete: authedProcedure
    .input(deleteItemInputSchema)
    .mutation(({ ctx, input }) => deleteItem(ctx, ctx.user.id, input)),

  check: authedProcedure
    .input(checkItemInputSchema)
    .mutation(({ ctx, input }) => checkItem(ctx, ctx.user.id, input)),

  uncheck: authedProcedure
    .input(uncheckItemInputSchema)
    .mutation(({ ctx, input }) => uncheckItem(ctx, ctx.user.id, input)),

  checkMany: authedProcedure
    .input(checkManyInputSchema)
    .mutation(({ ctx, input }) => checkMany(ctx, ctx.user.id, input)),
});
