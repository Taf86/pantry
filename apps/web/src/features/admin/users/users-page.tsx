import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilters } from "@/components/data-table/data-table-filters";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import { Button } from "@/components/ui/button";
import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import { type ListUsersInput } from "@pantry/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import useUsersTable, { toUserFilters, toUserSorting } from "./use-users-table";

export default function UsersPage() {
  const { t } = useTranslation();
  const { table, desktopColumns, mobileColumns, sortFields, filterFields } =
    useUsersTable();

  const input: ListUsersInput = {
    pagination: table.pagination,
    sorting: toUserSorting(table.sorting),
    filters: toUserFilters(table.columnFilters),
  };

  const users = useQuery({
    queryKey: keys.adminUsersList(input),
    queryFn: () => trpc.admin.users.list.query(input),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.users.title")}
        </h1>
        <div className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            nativeButton={false}
            render={<Link to="/admin/users/create" />}
          >
            <PlusIcon data-icon="inline-start" />
            {t("feature.users.action.create")}
          </Button>
          <DataTableSort state={table} fields={sortFields} />
          <DataTableFilters state={table} fields={filterFields} />
        </div>
      </div>

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={users.data?.rows ?? []}
        state={table}
        manual
        rowCount={users.data?.rowCount}
        getRowId={(user) => user.id}
        isPending={users.isPending}
        isFetching={users.isFetching}
        emptyMessage={t("feature.users.empty")}
      />
    </div>
  );
}
