import {
  Permission,
  createPantryInput,
  deletePantryInput,
  expiringInput,
  sharePantryInput,
  toListInput,
  unsharePantryInput,
  updatePantryInput,
} from "pantry-shared";

import { pantryToList } from "../../services/bridge.service.js";
import {
  expiringItems,
  missingItems,
} from "../../services/insights.service.js";
import { requireListPermission } from "../../services/membership.js";
import {
  createPantry,
  deletePantry,
  getPantryDetail,
  listUserPantries,
  sharePantry,
  unsharePantry,
  updatePantry,
} from "../../services/pantries.service.js";
import { pantryProcedure } from "../procedures.js";
import { authedProcedure, router } from "../trpc.js";

export const pantriesRouter = router({
  list: authedProcedure.query(({ ctx }) => listUserPantries(ctx, ctx.user.id)),

  get: pantryProcedure(Permission.Read).query(({ ctx, input }) =>
    getPantryDetail(ctx, input.pantryId, ctx.permissions),
  ),

  create: authedProcedure
    .input(createPantryInput)
    .mutation(({ ctx, input }) => createPantry(ctx, ctx.user.id, input)),

  update: pantryProcedure(Permission.Write)
    .input(updatePantryInput)
    .mutation(({ ctx, input }) =>
      updatePantry(ctx, ctx.user.id, ctx.permissions, input),
    ),

  delete: pantryProcedure(Permission.Write)
    .input(deletePantryInput)
    .mutation(({ ctx, input }) => deletePantry(ctx, ctx.user.id, input)),

  share: pantryProcedure(Permission.Manage)
    .input(sharePantryInput)
    .mutation(({ ctx, input }) =>
      sharePantry(ctx, ctx.user.id, ctx.permissions, input),
    ),

  unshare: pantryProcedure(Permission.Manage)
    .input(unsharePantryInput)
    .mutation(({ ctx, input }) =>
      unsharePantry(ctx, ctx.user.id, ctx.permissions, input),
    ),

  missing: pantryProcedure(Permission.Read).query(({ ctx, input }) =>
    missingItems(ctx, input.pantryId),
  ),

  expiring: pantryProcedure(Permission.Read)
    .input(expiringInput)
    .query(({ ctx, input }) =>
      expiringItems(ctx, input.pantryId, input.withinDays),
    ),

  /** Genera item di lista dai prodotti mancanti: serve anche `Write` sulla lista. */
  toList: pantryProcedure(Permission.Read)
    .input(toListInput)
    .mutation(async ({ ctx, input }) => {
      await requireListPermission(
        ctx.db,
        input.listId,
        ctx.user.id,
        Permission.Write,
      );
      return pantryToList(ctx, ctx.user.id, input);
    }),
});
