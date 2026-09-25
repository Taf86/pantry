import { TRPCError } from "@trpc/server";
import * as z from "zod";
import { can } from "@pantry/shared";

import { getListMembership } from "../services/lists/membership.js";
import { authedProcedure } from "./trpc.js";

/**
 * A procedure that resolves the caller's standing on a list once, and puts the
 * mask on the context.
 *
 * Declaring `listId` here means it is parsed before the middleware runs; tRPC
 * merges this input schema with whatever the procedure declares afterwards, so
 * `listProcedure(Permission.Write).input(fullSchema)` still validates the whole
 * payload. The point is that no procedure has to remember to check anything:
 * the permission is part of how the procedure is built.
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
