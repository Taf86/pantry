import {
  createUserInputSchema,
  editUserInputSchema,
  listUsersInputSchema,
  setUserRoleInputSchema,
  setUserStatusInputSchema,
  userIdInputSchema,
} from "@pantry/shared";
import {
  createUser,
  deleteUser,
  editUser,
  listUsers,
  regenerateInvite,
  requireUser,
  setRole,
  setStatus,
} from "../../services/admin/admin.service.js";
import { adminProcedure, router } from "../trpc.js";

export const adminRouter = router({
  users: router({
    list: adminProcedure
      .input(listUsersInputSchema)
      .query(({ ctx, input }) => listUsers(ctx, input)),
    get: adminProcedure
      .input(userIdInputSchema)
      .query(({ ctx, input }) => requireUser(ctx, input.userId)),
    create: adminProcedure
      .input(createUserInputSchema)
      .mutation(({ ctx, input }) => createUser(ctx, ctx.user.id, input)),

    edit: adminProcedure
      .input(editUserInputSchema)
      .mutation(({ ctx, input }) => editUser(ctx, ctx.user.id, input)),

    delete: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) => deleteUser(ctx, ctx.user.id, input.userId)),

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
