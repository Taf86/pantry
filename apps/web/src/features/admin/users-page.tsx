import { DataTable } from "@/components/data-table/data-table";
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
import { DataTableFilters } from "@/components/data-table/data-table-filters";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import useErrorMessage from "@/hooks/use-error-message";
import { inviteUrl } from "@/lib/invites";
import { keys } from "@/lib/keys";
import { copyToClipboard } from "@/lib/share";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  UserRoles,
  UserSortFields,
  UserStatuses,
  type ListUsersFilters,
  type ListUsersInput,
  type UserExtended,
  type UserSort,
  type UserSortField,
  type UserStatus as UserStatusValue,
} from "@pantry/shared";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { roleLabelKeys, statusLabelKeys } from "../../lib/user/user-labels";

const columnHelper = createDataTableColumnHelper<UserExtended>();

export default function UsersPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const table = useDataTableState<UserExtended>({
    sorting: [{ id: "displayName", desc: false }],
  });

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

  const onError = (cause: unknown) =>
    toast.add({ type: "error", description: errorMessage(cause) });

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: keys.adminUsers() });

  const setStatus = useMutation({
    mutationFn: (input: { userId: string; status: UserStatusValue }) =>
      trpc.admin.users.setStatus.mutate({
        userId: input.userId,
        status: input.status === "active" ? "active" : "suspended",
      }),
    networkMode: "online",
    onSuccess: refreshUsers,
    onError,
  });

  const regenerateInvite = useMutation({
    mutationFn: (userId: string) =>
      trpc.admin.users.regenerateInvite.mutate({ userId }),
    networkMode: "online",
    onSuccess: async (result) => {
      await refreshUsers();
      const url = inviteUrl(result.invite);
      toast.add({
        description: (await copyToClipboard(url))
          ? t("feature.users.inviteCopied")
          : t("feature.users.inviteLink", { url }),
      });
    },
    onError,
  });

  const { desktopColumns, mobileColumns } = useMemo<{
    desktopColumns: DataTableColumns<UserExtended>;
    mobileColumns: DataTableColumns<UserExtended>;
  }>(() => {
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
      cell: ({ getValue }) => <StatusBadge status={getValue()} />,
    });

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.users.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) => {
        const user = row.original;
        const suspended = user.status === "suspended";
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" />}
              aria-label={t("feature.users.action.menu")}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant={suspended ? "default" : "destructive"}
                onClick={() =>
                  setStatus.mutate({
                    userId: user.id,
                    status: suspended ? "active" : "suspended",
                  })
                }
              >
                {suspended
                  ? t("feature.users.action.activate")
                  : t("feature.users.action.suspend")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => regenerateInvite.mutate(user.id)}
              >
                {t("feature.users.action.regenerateInvite")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
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
  }, [t, setStatus, regenerateInvite]);

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
        data={users.data?.rows ?? noUsers}
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

const noUsers: UserExtended[] = [];

function StatusBadge({ status }: { status: UserStatusValue }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-xs ring-1 ring-inset",
        status === "active" && "text-foreground ring-border",
        status === "unactivated" && "text-muted-foreground ring-border",
        status === "suspended" && "text-destructive ring-destructive/40",
      )}
    >
      {t(statusLabelKeys[status])}
    </span>
  );
}

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
