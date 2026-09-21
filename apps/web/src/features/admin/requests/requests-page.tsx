import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilters } from "@/components/data-table/data-table-filters";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import type { ApproveRequestResult } from "@pantry/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AcceptedRequestDialog from "./accepted-request-dialog";
import useRequestsTable from "./use-requests-table";

export default function RequestsPage() {
  const { t } = useTranslation();

  const [approved, setApproved] = useState<ApproveRequestResult | null>(null);
  const onApproved = useCallback(
    (result: ApproveRequestResult) => setApproved(result),
    [],
  );

  const {
    table,
    input,
    desktopColumns,
    mobileColumns,
    sortFields,
    filterFields,
  } = useRequestsTable({ onApproved });

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

      <AcceptedRequestDialog
        approved={approved}
        onClose={() => setApproved(null)}
      />
    </div>
  );
}
