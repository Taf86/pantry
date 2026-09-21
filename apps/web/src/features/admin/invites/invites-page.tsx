import { DataTable } from "@/components/data-table/data-table";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useInvitesTable from "./use-invites-table";

export default function InvitesPage() {
  const { t } = useTranslation();
  const { table, input, desktopColumns, mobileColumns, sortFields } =
    useInvitesTable();

  const invites = useQuery({
    queryKey: keys.adminInvitesList(input),
    queryFn: () => trpc.admin.invites.list.query(input),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.invites.title")}
        </h1>
        <div className="ms-auto flex items-center gap-2">
          <DataTableSort state={table} fields={sortFields} />
        </div>
      </div>

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={invites.data?.rows ?? []}
        state={table}
        manual
        rowCount={invites.data?.rowCount}
        getRowId={(invite) => invite.id}
        isPending={invites.isPending}
        isFetching={invites.isFetching}
        emptyMessage={t("feature.invites.empty")}
      />
    </div>
  );
}
