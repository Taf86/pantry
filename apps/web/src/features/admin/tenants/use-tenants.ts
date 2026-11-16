import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export default function useTenants() {
  const tenants = useQuery({
    queryKey: keys.adminTenants(),
    queryFn: () => trpc.admin.tenants.list.query(),
    networkMode: "online",
  });

  const tenantItems = useMemo(
    () =>
      Object.fromEntries(
        (tenants.data ?? []).map((tenant) => [tenant.id, tenant.name]),
      ),
    [tenants.data],
  );

  return { tenants, tenantItems };
}
