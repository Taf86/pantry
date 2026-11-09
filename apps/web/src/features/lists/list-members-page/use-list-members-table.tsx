import {
  createDataTableColumnHelper,
  useDataTableState,
  type DataTableColumns,
  type DataTableSortField,
} from "@/components/data-table/data-table-core";
import { Badge } from "@/components/ui/badge";
import useRequireAuth from "@/hooks/use-require-auth";
import {
  Permission,
  can,
  roleOf,
  type ListMembers,
  type ListMember,
} from "@pantry/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import MemberRoleSelect from "./member-role-select";
import RemoveMemberAction from "./remove-member-action";
import { roleLabelKeys } from "../common/role-labels";

const columnHelper = createDataTableColumnHelper<ListMember>();

export default function useListMembersTable(
  listMembers: ListMembers,
  disabled: boolean,
) {
  const { t } = useTranslation();
  const me = useRequireAuth();
  const table = useDataTableState<ListMember>();

  const canManage = can(
    listMembers?.members?.find((m) => m.userId === me.id)?.permissions,
    Permission.Manage,
  );

  const { desktopColumns, mobileColumns } = useMemo<MembersColumns>(() => {
    const displayName = columnHelper.accessor("userDisplayName", {
      header: t("feature.lists.column.name"),
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-48 truncate">
            {row.original.userDisplayName}
          </span>
          {row.original.userId === me.id && (
            <Badge variant="outline">{t("feature.lists.members.you")}</Badge>
          )}
          {row.original.userId === listMembers.createdBy && (
            <Badge variant="secondary">
              {t("feature.lists.members.creator")}
            </Badge>
          )}
        </span>
      ),
    });

    const email = columnHelper.accessor("userEmail", {
      header: t("feature.lists.members.email"),
      cell: ({ getValue }) => (
        <span className="block max-w-64 truncate">{getValue()}</span>
      ),
    });

    const permissions = columnHelper.accessor("permissions", {
      header: t("feature.lists.members.role"),
      cell: ({ row }) => {
        if (canManage) {
          return (
            <MemberRoleSelect
              listId={listMembers.listId}
              member={row.original}
              disabled={disabled}
            />
          );
        }
        const role = roleOf(row.original.permissions);
        return (
          <Badge variant="outline">
            {role ? t(roleLabelKeys[role]) : t("feature.lists.role.custom")}
          </Badge>
        );
      },
    });

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.lists.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) =>
        canManage || me.id === row.original.userId ? (
          <RemoveMemberAction
            list={listMembers}
            member={row.original}
            disabled={disabled}
          />
        ) : null,
    });

    const columns = [displayName, email, permissions, actions];

    return {
      desktopColumns: columnHelper.columns(columns),
      mobileColumns: columnHelper.columns(columns),
    };
  }, [t, me.id, listMembers, canManage, disabled]);

  const sortFields = useMemo<DataTableSortField<ListMember>[]>(
    () => [
      { columnId: "userDisplayName", label: t("feature.lists.column.name") },
      { columnId: "userEmail", label: t("feature.lists.members.email") },
      { columnId: "permissions", label: t("feature.lists.members.role") },
    ],
    [t],
  );

  return { table, desktopColumns, mobileColumns, sortFields };
}

interface MembersColumns {
  desktopColumns: DataTableColumns<ListMember>;
  mobileColumns: DataTableColumns<ListMember>;
}
