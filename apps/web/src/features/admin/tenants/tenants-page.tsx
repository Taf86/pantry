import { DataTable } from "@/components/data-table/data-table";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import ErrorPage from "@/components/errors/error-page";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import useTenants from "./use-tenants";
import useTenantsTable from "./use-tenants-table";

export default function TenantsPage() {
  const { t } = useTranslation();
  const { table, desktopColumns, mobileColumns, sortFields } =
    useTenantsTable();
  const { tenants } = useTenants();

  if (tenants.isError) {
    return (
      <ErrorPage
        title={t("feature.tenants.loadFailedTitle")}
        description={t("feature.tenants.loadFailed")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.tenants.title")}
        </h1>
        <div className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            nativeButton={false}
            render={<Link to="/admin/tenants/create" />}
          >
            <PlusIcon data-icon="inline-start" />
            {t("feature.tenants.action.create")}
          </Button>
          <DataTableSort state={table} fields={sortFields} />
        </div>
      </div>

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={tenants.data ?? []}
        state={table}
        getRowId={(tenant) => tenant.id}
        isPending={tenants.isPending}
        isFetching={tenants.isFetching}
        emptyMessage={t("feature.tenants.empty")}
      />
    </div>
  );
}
