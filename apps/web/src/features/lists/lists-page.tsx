import { DataTable } from "@/components/data-table/data-table";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import ErrorPage from "@/components/errors/error-page";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useLists } from "./use-lists";
import useListsTable from "./use-lists-table";

export default function ListsPage() {
  const { t } = useTranslation();
  const { table, desktopColumns, mobileColumns, sortFields } = useListsTable();
  const lists = useLists();

  if (lists.isError) {
    return (
      <ErrorPage
        title={t("feature.lists.index.loadFailedTitle")}
        description={t("feature.lists.index.loadFailed")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.lists.index.title")}
        </h1>
        <div className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            nativeButton={false}
            render={<Link to="/lists/new" />}
          >
            <PlusIcon data-icon="inline-start" />
            {t("feature.lists.action.create")}
          </Button>
          <DataTableSort state={table} fields={sortFields} />
        </div>
      </div>

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={lists.data ?? []}
        state={table}
        getRowId={(list) => list.id}
        isPending={lists.isPending}
        isFetching={lists.isFetching}
        emptyMessage={t("feature.lists.index.empty")}
      />
    </div>
  );
}
