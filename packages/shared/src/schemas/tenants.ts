export type TenantRef = {
  id: string;
  name: string;
};
export type Tenant = TenantRef & {
  main: boolean;
};
