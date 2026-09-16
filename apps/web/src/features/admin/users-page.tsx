import { DataTable } from "@/components/data-table/data-table";
import {
  createDataTableColumnHelper,
  useDataTableState,
  type DataTableColumns,
  type DataTableFilterField,
} from "@/components/data-table/data-table-core";
import {
  DataTableFilters,
  DataTableTextFilter,
} from "@/components/data-table/data-table-filters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import useErrorMessage from "@/hooks/use-error-message";
import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  UserRole,
  UserRoles,
  UserSortFields,
  UserStatus,
  UserStatuses,
  type InviteLink,
  type ListUsersFilters,
  type ListUsersInput,
  type UserExtended,
  type UserRole as UserRoleValue,
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
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const columnHelper = createDataTableColumnHelper<UserExtended>();

const statusLabelKeys = {
  [UserStatus.unactivated]: "feature.users.status.unactivated",
  [UserStatus.active]: "feature.users.status.active",
  [UserStatus.suspended]: "feature.users.status.suspended",
} as const;

const roleLabelKeys = {
  [UserRole.user]: "feature.users.role.user",
  [UserRole.admin]: "feature.users.role.admin",
} as const;

export default function UsersPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const table = useDataTableState({
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

  const columns = useMemo<DataTableColumns<UserExtended>>(
    () =>
      columnHelper.columns([
        columnHelper.accessor("displayName", {
          header: t("feature.users.column.name"),
        }),

        columnHelper.accessor("email", {
          header: t("feature.users.column.email"),
          cell: ({ getValue }) => (
            <span className="text-muted-foreground">{getValue()}</span>
          ),
        }),

        columnHelper.accessor("role", {
          header: t("feature.users.column.role"),
          cell: ({ getValue }) => t(roleLabelKeys[getValue()]),
        }),

        columnHelper.accessor("status", {
          header: t("feature.users.column.status"),
          cell: ({ getValue }) => <StatusBadge status={getValue()} />,
        }),

        columnHelper.display({
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
        }),
      ]),
    [t, setStatus, regenerateInvite],
  );

  const filterFields = useMemo<DataTableFilterField[]>(
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
        <DataTableTextFilter
          state={table}
          columnId="displayName"
          label={t("feature.users.column.name")}
          className="w-32 sm:w-56"
        />
        <DataTableFilters
          state={table}
          fields={filterFields}
          className="ms-auto"
        />
      </div>

      <DataTable
        columns={columns}
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

const toUserSorting = (sorting: SortingState): UserSort[] =>
  sorting.filter((sort): sort is UserSort => isUserSortField(sort.id));

const toUserFilters = (columnFilters: ColumnFiltersState): ListUsersFilters => {
  const filters: ListUsersFilters = {};
  for (const { id, value } of columnFilters) {
    if (id === "displayName" && typeof value === "string" && value.trim()) {
      filters.displayName = value.trim();
    }
    if (id === "email" && typeof value === "string" && value.trim()) {
      filters.email = value.trim();
    }
    if (id === "role" && Array.isArray(value)) {
      const roles = value.filter(isUserRole);
      if (roles.length > 0) filters.role = roles;
    }
    if (id === "status" && Array.isArray(value)) {
      const statuses = value.filter(isUserStatus);
      if (statuses.length > 0) filters.status = statuses;
    }
  }
  return filters;
};

const isUserRole = (value: unknown): value is UserRoleValue =>
  typeof value === "string" && (UserRoles as readonly string[]).includes(value);

const isUserStatus = (value: unknown): value is UserStatusValue =>
  typeof value === "string" &&
  (UserStatuses as readonly string[]).includes(value);

const inviteUrl = (invite: InviteLink) =>
  new URL(`/invite/${invite.token}`, window.location.origin).href;

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
