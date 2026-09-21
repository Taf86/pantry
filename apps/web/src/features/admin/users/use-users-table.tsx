import {
  createDataTableColumnHelper,
  optionsFilterValue,
  textFilterValue,
  useDataTableState,
  type DataTableColumns,
  type DataTableFilterField,
  type DataTableFiltersState,
  type DataTableSortField,
  type DataTableSortingState,
} from "@/components/data-table/data-table-core";
import { Button } from "@/components/ui/button";
import { roleLabelKeys, statusLabelKeys } from "@/lib/user/user-labels";
import {
  UserRoles,
  UserSortFields,
  UserStatuses,
  type ListUsersFilters,
  type ListUsersInput,
  type UserExtended,
  type UserSort,
  type UserSortField,
} from "@pantry/shared";
import { PencilIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import DeleteUserAction from "./delete-user-action";
import UserStatusBadge from "./user-status-badge";

const columnHelper = createDataTableColumnHelper<UserExtended>();

export default function useUsersTable() {
  const { t } = useTranslation();
  const table = useDataTableState<UserExtended>({
    sorting: [{ id: "displayName", desc: false }],
  });

  const { desktopColumns, mobileColumns } = useMemo<UsersColumns>(() => {
    const name = columnHelper.accessor("displayName", {
      header: t("feature.users.column.name"),
    });

    const email = columnHelper.accessor("email", {
      header: t("feature.users.column.email"),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue()}</span>
      ),
    });
    const mobileEmail = columnHelper.accessor("email", {
      header: t("feature.users.column.email"),
    });

    const role = columnHelper.accessor("role", {
      header: t("feature.users.column.role"),
      cell: ({ getValue }) => t(roleLabelKeys[getValue()]),
    });

    const status = columnHelper.accessor("status", {
      header: t("feature.users.column.status"),
      cell: ({ getValue }) => <UserStatusBadge status={getValue()} />,
    });

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.users.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            nativeButton={false}
            aria-label={t("feature.users.action.edit")}
            render={<Link to={`/admin/users/${row.original.id}`} />}
          >
            <PencilIcon />
          </Button>
          <DeleteUserAction user={row.original} />
        </div>
      ),
    });

    return {
      desktopColumns: columnHelper.columns([
        name,
        email,
        role,
        status,
        actions,
      ]),
      mobileColumns: columnHelper.columns([
        name,
        mobileEmail,
        role,
        status,
        actions,
      ]),
    };
  }, [t]);

  const sortFields = useMemo<DataTableSortField<UserExtended>[]>(
    () => [
      { columnId: "displayName", label: t("feature.users.column.name") },
      { columnId: "email", label: t("feature.users.column.email") },
      { columnId: "role", label: t("feature.users.column.role") },
      { columnId: "status", label: t("feature.users.column.status") },
    ],
    [t],
  );

  const filterFields = useMemo<DataTableFilterField<UserExtended>[]>(
    () => [
      {
        columnId: "displayName",
        label: t("feature.users.column.name"),
        filter: { kind: "text" },
      },
      {
        columnId: "email",
        label: t("feature.users.column.email"),
        filter: { kind: "text" },
      },
      {
        columnId: "role",
        label: t("feature.users.column.role"),
        filter: {
          kind: "options",
          options: UserRoles.map((role) => ({
            value: role,
            label: t(roleLabelKeys[role]),
          })),
        },
      },
      {
        columnId: "status",
        label: t("feature.users.column.status"),
        filter: {
          kind: "options",
          options: UserStatuses.map((status) => ({
            value: status,
            label: t(statusLabelKeys[status]),
          })),
        },
      },
    ],
    [t],
  );

  const input = useMemo<ListUsersInput>(
    () => ({
      pagination: table.pagination,
      sorting: toUserSorting(table.sorting),
      filters: toUserFilters(table.columnFilters),
    }),
    [table],
  );

  return {
    table,
    input,
    desktopColumns,
    mobileColumns,
    sortFields,
    filterFields,
  };
}

type UsersColumns = {
  desktopColumns: DataTableColumns<UserExtended>;
  mobileColumns: DataTableColumns<UserExtended>;
};

const isUserSortField = (id: string): id is UserSortField =>
  (UserSortFields as readonly string[]).includes(id);

const toUserSorting = (
  sorting: DataTableSortingState<UserExtended>,
): UserSort[] =>
  sorting.filter((sort): sort is UserSort => isUserSortField(sort.id));

const toUserFilters = (
  columnFilters: DataTableFiltersState<UserExtended>,
): ListUsersFilters => {
  const displayName = textFilterValue(columnFilters, "displayName");
  const email = textFilterValue(columnFilters, "email");
  const role = optionsFilterValue(columnFilters, "role", UserRoles);
  const status = optionsFilterValue(columnFilters, "status", UserStatuses);

  return {
    ...(displayName !== undefined && { displayName }),
    ...(email !== undefined && { email }),
    ...(role.length > 0 && { role }),
    ...(status.length > 0 && { status }),
  };
};
