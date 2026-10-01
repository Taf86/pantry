import {
  createDataTableColumnHelper,
  useDataTableState,
  type DataTableColumns,
  type DataTableSortField,
} from "@/components/data-table/data-table-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import useRequireAuth from "@/hooks/use-require-auth";
import { Permission, can, roleOf, type ListSummary } from "@pantry/shared";
import { PencilIcon, UsersIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import DeleteListAction from "./delete-list-action";
import { roleLabelKeys } from "./role-labels";

const columnHelper = createDataTableColumnHelper<ListSummary>();

export default function useListsTable() {
  const { t } = useTranslation();
  const me = useRequireAuth();
  const table = useDataTableState<ListSummary>();

  const { desktopColumns, mobileColumns } = useMemo<ListsColumns>(() => {
    const name = columnHelper.accessor("name", {
      header: t("feature.lists.column.name"),
      cell: ({ getValue }) => (
        <span className="block max-w-64 truncate">{getValue()}</span>
      ),
    });

    const permissions = columnHelper.accessor("permissions", {
      header: t("feature.lists.column.role"),
      cell: ({ row }) => {
        const role = roleOf(row.original.permissions);
        return role ? (
          <Badge variant="secondary">{t(roleLabelKeys[role])}</Badge>
        ) : null;
      },
    });

    const createdBy = columnHelper.accessor(
      (list) =>
        list.createdBy === me.id
          ? t("feature.lists.index.createdByYou")
          : (list.createdByDisplayName ??
            t("feature.lists.index.createdByUnknown")),
      {
        id: "creatorName",
        header: t("feature.lists.column.createdBy"),
      },
    );

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.lists.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) => {
        const list = row.original;
        const canManage = can(list.permissions, Permission.Manage);
        const membersLabel = t(
          canManage
            ? "feature.lists.action.manageMembers"
            : "feature.lists.action.members",
        );
        return (
          <div className="flex items-center justify-end gap-1">
            {can(list.permissions, Permission.Write) && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("feature.lists.action.edit")}
                title={t("feature.lists.action.edit")}
                nativeButton={false}
                render={<Link to={`/lists/${list.id}/edit`} />}
              >
                <PencilIcon />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={membersLabel}
              title={membersLabel}
              nativeButton={false}
              render={<Link to={`/lists/${list.id}/members`} />}
            >
              <UsersIcon />
            </Button>
            {canManage && <DeleteListAction list={list} />}
          </div>
        );
      },
    });

    const columns = [name, permissions, createdBy, actions];

    return {
      desktopColumns: columnHelper.columns(columns),
      mobileColumns: columnHelper.columns(columns),
    };
  }, [t, me.id]);

  const sortFields = useMemo<DataTableSortField<ListSummary>[]>(
    () => [
      { columnId: "name", label: t("feature.lists.column.name") },
      { columnId: "permissions", label: t("feature.lists.column.role") },
    ],
    [t],
  );

  return { table, desktopColumns, mobileColumns, sortFields };
}

interface ListsColumns {
  desktopColumns: DataTableColumns<ListSummary>;
  mobileColumns: DataTableColumns<ListSummary>;
}
