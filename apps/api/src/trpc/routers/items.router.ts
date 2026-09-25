import {
  Permission,
  addItemInputSchema,
  checkItemInputSchema,
  checkManyInputSchema,
  deleteItemInputSchema,
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
import { assertListPermissions } from "../../services/lists/membership.js";
import { catalogForList } from "../../services/lists/products.service.js";
import { listProcedure } from "../procedures.js";
import { authedProcedure, router } from "../trpc.js";

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

  // Ticking needs Shop, not Write. That separation is what makes it sensible
  // to share a list with somebody you only ask to do the shopping — and note
  // that holding the lease is NOT required: a shopper whose lease expired
  // while they were offline still drains their queue.
  check: listProcedure(Permission.Shop)
    .input(checkItemInputSchema)
    .mutation(({ ctx, input }) => checkItem(ctx, ctx.user.id, input)),

  uncheck: listProcedure(Permission.Shop)
    .input(uncheckItemInputSchema)
    .mutation(({ ctx, input }) => uncheckItem(ctx, ctx.user.id, input)),

  // Crosses lists, so there is no single listId for the middleware to resolve:
  // the permission check moves into the procedure, over the whole batch.
  checkMany: authedProcedure
    .input(checkManyInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertListPermissions(
        ctx.db,
        input.checks.map((check) => check.listId),
        ctx.user.id,
        Permission.Shop,
      );
      return checkMany(ctx, ctx.user.id, input);
    }),
});
