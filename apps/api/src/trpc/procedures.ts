import { TRPCError } from "@trpc/server";
import { can } from "pantry-shared";
import { z } from "zod";

import {
  getListMembership,
  getPantryMembership,
} from "../services/membership.js";
import { authedProcedure } from "./trpc.js";

/**
 * La membership si risolve una volta sola e finisce nel context.
 * Nessun controllo di permessi sparso dentro le procedure: se una procedura
 * è dichiarata `listProcedure(Permission.Write)`, l'autorizzazione è già
 * avvenuta quando il corpo comincia a girare.
 */
export const listProcedure = (required: number) =>
  authedProcedure
    .input(z.object({ listId: z.uuid() }))
    .use(async ({ ctx, input, next }) => {
      const membership = await getListMembership(
        ctx.db,
        input.listId,
        ctx.user.id,
      );
      if (!membership || !can(membership.permissions, required)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return next({ ctx: { ...ctx, permissions: membership.permissions } });
    });

export const pantryProcedure = (required: number) =>
  authedProcedure
    .input(z.object({ pantryId: z.uuid() }))
    .use(async ({ ctx, input, next }) => {
      const membership = await getPantryMembership(
        ctx.db,
        input.pantryId,
        ctx.user.id,
      );
      if (!membership || !can(membership.permissions, required)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return next({ ctx: { ...ctx, permissions: membership.permissions } });
    });
