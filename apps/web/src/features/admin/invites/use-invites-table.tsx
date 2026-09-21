import {
  createDataTableColumnHelper,
  useDataTableState,
  type DataTableColumns,
  type DataTableSortField,
  type DataTableSortingState,
} from "@/components/data-table/data-table-core";
import { formatDateTime } from "@/lib/dates";
import {
  InviteSortFields,
  type InviteExtended,
  type InviteSort,
  type InviteSortField,
  type ListInvitesInput,
} from "@pantry/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import UserStatusBadge from "../users/user-status-badge";
import DeleteInviteAction from "./delete-invite-action";

const columnHelper = createDataTableColumnHelper<InviteExtended>();

export default function useInvitesTable() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const table = useDataTableState<InviteExtended>({
    sorting: [{ id: "expiresAt", desc: true }],
  });

  const { desktopColumns, mobileColumns } = useMemo<InvitesColumns>(() => {
    const user = columnHelper.accessor("user", {
      header: t("feature.invites.column.user"),
      cell: ({ getValue }) => {
        const target = getValue();
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span>{target.displayName}</span>
            <UserStatusBadge status={target.status} />
          </div>
        );
      },
    });

    const usedAt = columnHelper.accessor("usedAt", {
      header: t("feature.invites.column.usedAt"),
      cell: ({ getValue }) => formatDateTime(getValue(), locale),
    });

    const expiresAt = columnHelper.accessor("expiresAt", {
      header: t("feature.invites.column.expiresAt"),
      cell: ({ getValue }) => formatDateTime(getValue(), locale),
    });

    const createdBy = columnHelper.accessor("createdBy", {
      header: t("feature.invites.column.createdBy"),
      cell: ({ getValue }) => getValue().displayName,
    });

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.invites.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <DeleteInviteAction invite={row.original} />
        </div>
      ),
    });

    const columns = [user, usedAt, expiresAt, createdBy, actions];

    return {
      desktopColumns: columnHelper.columns(columns),
      mobileColumns: columnHelper.columns(columns),
    };
  }, [t, locale]);

  const sortFields = useMemo<DataTableSortField<InviteExtended>[]>(
    () => [
      { columnId: "user", label: t("feature.invites.column.user") },
      { columnId: "usedAt", label: t("feature.invites.column.usedAt") },
      { columnId: "expiresAt", label: t("feature.invites.column.expiresAt") },
      { columnId: "createdBy", label: t("feature.invites.column.createdBy") },
    ],
    [t],
  );

  const input = useMemo<ListInvitesInput>(
    () => ({
      pagination: table.pagination,
      sorting: toInviteSorting(table.sorting),
    }),
    [table],
  );

  return { table, input, desktopColumns, mobileColumns, sortFields };
}

type InvitesColumns = {
  desktopColumns: DataTableColumns<InviteExtended>;
  mobileColumns: DataTableColumns<InviteExtended>;
};

const isInviteSortField = (id: string): id is InviteSortField =>
  (InviteSortFields as readonly string[]).includes(id);

const toInviteSorting = (
  sorting: DataTableSortingState<InviteExtended>,
): InviteSort[] =>
  sorting.filter((sort): sort is InviteSort => isInviteSortField(sort.id));
