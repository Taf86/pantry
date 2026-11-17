import {
  approveRequestInputSchema,
  createTenantInputSchema,
  createUserInputSchema,
  tenantIdInputSchema,
  updateTenantInputSchema,
  editUserInputSchema,
  inviteIdInputSchema,
  listInvitesInputSchema,
  listRequestsInputSchema,
  listUsersInputSchema,
  requestIdInputSchema,
  setUserRoleInputSchema,
  setUserStatusInputSchema,
  userIdInputSchema,
} from "@pantry/shared";
import {
  deleteInvite,
  getInvites,
} from "../../services/admin/invites.service.js";
import {
  approveRequest,
  getRequests,
  rejectRequest,
  requireRequest,
} from "../../services/admin/requests.service.js";
import {
  createUser,
  deleteUser,
  editUser,
  getUsers,
  regenerateInvite,
  requireUser,
  setRole,
  setStatus,
} from "../../services/admin/admin.service.js";
import {
  createTenant,
  deleteTenant,
  getTenants,
  updateTenant,
} from "../../services/tenants/tenants.service.js";
import { adminProcedure, router } from "../trpc.js";

export const adminRouter = router({
  tenants: router({
    list: adminProcedure.query(({ ctx }) => getTenants(ctx, ctx.user.id)),

    create: adminProcedure
      .input(createTenantInputSchema)
      .mutation(({ ctx, input }) => createTenant(ctx, input)),

    update: adminProcedure
      .input(updateTenantInputSchema)
      .mutation(({ ctx, input }) => updateTenant(ctx, input)),

    delete: adminProcedure
      .input(tenantIdInputSchema)
      .mutation(({ ctx, input }) =>
        deleteTenant(ctx, ctx.user.id, input.tenantId),
      ),
  }),

  users: router({
    list: adminProcedure
      .input(listUsersInputSchema)
      .query(({ ctx, input }) => getUsers(ctx, input)),
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

  invites: router({
    list: adminProcedure
      .input(listInvitesInputSchema)
      .query(({ ctx, input }) => getInvites(ctx, input)),

    delete: adminProcedure
      .input(inviteIdInputSchema)
      .mutation(({ ctx, input }) => deleteInvite(ctx, input.inviteId)),
  }),

  requests: router({
    list: adminProcedure
      .input(listRequestsInputSchema)
      .query(({ ctx, input }) => getRequests(ctx, input)),

    get: adminProcedure
      .input(requestIdInputSchema)
      .query(({ ctx, input }) => requireRequest(ctx, input.requestId)),

    approve: adminProcedure
      .input(approveRequestInputSchema)
      .mutation(({ ctx, input }) => approveRequest(ctx, ctx.user.id, input)),

    reject: adminProcedure
      .input(requestIdInputSchema)
      .mutation(({ ctx, input }) =>
        rejectRequest(ctx, ctx.user.id, input.requestId),
      ),
  }),
});
