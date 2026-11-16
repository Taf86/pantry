import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilters } from "@/components/data-table/data-table-filters";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useRequestsTable from "./use-requests-table";

export default function RequestsPage() {
  const { t } = useTranslation();

  const {
    table,
    input,
    desktopColumns,
    mobileColumns,
    sortFields,
    filterFields,
  } = useRequestsTable();

  const requests = useQuery({
    queryKey: keys.adminRequestsList(input),
    queryFn: () => trpc.admin.requests.list.query(input),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.requests.title")}
        </h1>
        <div className="ms-auto flex items-center gap-2">
          <DataTableSort state={table} fields={sortFields} />
          <DataTableFilters state={table} fields={filterFields} />
        </div>
      </div>

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={requests.data?.rows ?? []}
        state={table}
        manual
        rowCount={requests.data?.rowCount}
        getRowId={(request) => request.id}
        isPending={requests.isPending}
        isFetching={requests.isFetching}
        emptyMessage={t("feature.requests.empty")}
      />
    </div>
  );
}
