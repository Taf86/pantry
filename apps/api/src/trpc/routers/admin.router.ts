import {
  createUserInputSchema,
  listUsersInputSchema,
  setUserRoleInputSchema,
  setUserStatusInputSchema,
  userIdInputSchema,
} from "@pantry/shared";
import {
  createUser,
  listUsers,
  regenerateInvite,
  setRole,
  setStatus,
} from "../../services/admin/admin.service.js";
import { adminProcedure, router } from "../trpc.js";

export const adminRouter = router({
  users: router({
    list: adminProcedure
      .input(listUsersInputSchema)
      .query(({ ctx, input }) => listUsers(ctx, input)),
    create: adminProcedure
      .input(createUserInputSchema)
      .mutation(({ ctx, input }) => createUser(ctx, ctx.user.id, input)),

    regenerateInvite: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) =>
        regenerateInvite(ctx, ctx.user.id, input.userId),
      ),

    setStatus: adminProcedure
      .input(setUserStatusInputSchema)
      .mutation(({ ctx, input }) => setStatus(ctx, ctx.user.id, input)),

    setRole: adminProcedure
      .input(setUserRoleInputSchema)
      .mutation(({ ctx, input }) => setRole(ctx, input)),
  }),
});
