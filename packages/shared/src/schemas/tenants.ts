import * as z from "zod";
import { nameSchema } from "./common.js";

export type TenantRef = {
  id: string;
  name: string;
};
export type Tenant = TenantRef & {
  main: boolean;
};
export type TenantSummary = Tenant & {
  userCount: number;
  /** The tenant of the admin asking. */
  own: boolean;
};

export const createTenantInputSchema = z.object({
  name: nameSchema,
});
export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;

export const updateTenantInputSchema = z.object({
  tenantId: z.uuid(),
  name: nameSchema,
});
export type UpdateTenantInput = z.infer<typeof updateTenantInputSchema>;

export const tenantIdInputSchema = z.object({
  tenantId: z.uuid(),
});
export type TenantIdInput = z.infer<typeof tenantIdInputSchema>;
