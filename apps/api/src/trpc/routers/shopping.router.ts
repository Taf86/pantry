import {
  Permission,
  checkManyInput,
  shoppingSessionInput,
  toPantryInput,
} from "pantry-shared";

import { shoppingToPantry } from "../../services/bridge.service.js";
import { checkMany } from "../../services/items.service.js";
import {
  assertListPermissions,
  requireListPermission,
  requirePantryPermission,
} from "../../services/membership.js";
import { getShoppingSession } from "../../services/shopping.service.js";
import { authedProcedure, router } from "../trpc.js";

export const shoppingRouter = router({
  /**
   * Precarico esplicito prima di entrare in modalità spesa: da qui in poi
   * l'app deve funzionare senza rete.
   */
  session: authedProcedure
    .input(shoppingSessionInput)
    .query(({ ctx, input }) =>
      getShoppingSession(ctx, ctx.user.id, input.listIds),
    ),

  /**
   * Svuotamento della coda offline. Attraversa più liste, quindi il permesso
   * si verifica qui in blocco: nessun `listProcedure` può farlo al posto
   * nostro.
   */
  checkMany: authedProcedure
    .input(checkManyInput)
    .mutation(async ({ ctx, input }) => {
      await assertListPermissions(
        ctx.db,
        input.checks.map((check) => check.listId),
        ctx.user.id,
        Permission.Shop,
      );
      return checkMany(ctx, ctx.user.id, input);
    }),

  /**
   * Il ritorno dal supermercato: i prodotti comprati si riversano nella
   * dispensa. Tocca due aggregati, quindi vuole entrambi i permessi.
   */
  toPantry: authedProcedure
    .input(toPantryInput)
    .mutation(async ({ ctx, input }) => {
      await requireListPermission(
        ctx.db,
        input.listId,
        ctx.user.id,
        input.clearFromList ? Permission.Write : Permission.Read,
      );
      await requirePantryPermission(
        ctx.db,
        input.pantryId,
        ctx.user.id,
        Permission.Write,
      );
      return shoppingToPantry(ctx, ctx.user.id, input);
    }),
});
