import {
  createDataTableColumnHelper,
  useDataTableState,
  type DataTableColumns,
  type DataTableSortField,
} from "@/components/data-table/data-table-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TenantSummary } from "@pantry/shared";
import { PencilIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import DeleteTenantAction from "./delete-tenant-action";

const columnHelper = createDataTableColumnHelper<TenantSummary>();

export default function useTenantsTable() {
  const { t } = useTranslation();
  const table = useDataTableState<TenantSummary>();

  const { desktopColumns, mobileColumns } = useMemo<TenantsColumns>(() => {
    const name = columnHelper.accessor("name", {
      header: t("feature.tenants.column.name"),
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span className="max-w-64 truncate">{row.original.name}</span>
          {row.original.main && (
            <Badge variant="secondary">{t("feature.tenants.main")}</Badge>
          )}
          {row.original.own && (
            <Badge variant="outline">{t("feature.tenants.own")}</Badge>
          )}
        </span>
      ),
    });

    const userCount = columnHelper.accessor("userCount", {
      header: t("feature.tenants.column.users"),
    });

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.tenants.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            nativeButton={false}
            aria-label={t("feature.tenants.action.edit")}
            title={t("feature.tenants.action.edit")}
            render={<Link to={`/admin/tenants/${row.original.id}`} />}
          >
            <PencilIcon />
          </Button>
          <DeleteTenantAction tenant={row.original} />
        </div>
      ),
    });

    const columns = columnHelper.columns([name, userCount, actions]);
    return { desktopColumns: columns, mobileColumns: columns };
  }, [t]);

  const sortFields = useMemo<DataTableSortField<TenantSummary>[]>(
    () => [
      { columnId: "name", label: t("feature.tenants.column.name") },
      { columnId: "userCount", label: t("feature.tenants.column.users") },
    ],
    [t],
  );

  return { table, desktopColumns, mobileColumns, sortFields };
}

type TenantsColumns = {
  desktopColumns: DataTableColumns<TenantSummary>;
  mobileColumns: DataTableColumns<TenantSummary>;
};
