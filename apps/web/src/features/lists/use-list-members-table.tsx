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
  type ListDetail,
  type ListMember,
} from "@pantry/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import MemberRoleSelect from "./member-role-select";
import RemoveMemberAction from "./remove-member-action";
import { roleLabelKeys } from "./role-labels";

/** Flattened so the user's fields are columns the table can sort by. */
export type MemberRow = ListMember & { displayName: string; email: string };

const columnHelper = createDataTableColumnHelper<MemberRow>();

/**
 * Members come with the list detail, so sorting and paging happen here. No
 * initial sorting: the server's order is already the one worth showing.
 */
export default function useListMembersTable(
  list: ListDetail,
  disabled: boolean,
) {
  const { t } = useTranslation();
  const me = useRequireAuth();
  const table = useDataTableState<MemberRow>();

  const canManage = can(list.permissions, Permission.Manage);

  const data = useMemo<MemberRow[]>(
    () =>
      list.members.map((member) => ({
        ...member,
        displayName: member.user.displayName,
        email: member.user.email,
      })),
    [list.members],
  );

  const { desktopColumns, mobileColumns } = useMemo<MembersColumns>(() => {
    // Your own row is left alone: leaving has its own button, and the server
    // keeps at least one manager whatever happens.
    const editable = (member: ListMember) =>
      canManage && member.user.id !== me.id;

    const displayName = columnHelper.accessor("displayName", {
      header: t("feature.lists.column.name"),
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-48 truncate">{row.original.displayName}</span>
          {row.original.user.id === me.id && (
            <Badge variant="outline">{t("feature.lists.members.you")}</Badge>
          )}
          {row.original.user.id === list.createdBy && (
            <Badge variant="secondary">
              {t("feature.lists.members.creator")}
            </Badge>
          )}
        </span>
      ),
    });

    const email = columnHelper.accessor("email", {
      header: t("feature.lists.members.email"),
      cell: ({ getValue }) => (
        <span className="block max-w-64 truncate">{getValue()}</span>
      ),
    });

    const permissions = columnHelper.accessor("permissions", {
      header: t("feature.lists.members.role"),
      cell: ({ row }) => {
        if (editable(row.original)) {
          return (
            <MemberRoleSelect
              listId={list.id}
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
        editable(row.original) ? (
          <RemoveMemberAction
            list={list}
            member={row.original}
            disabled={disabled}
          />
        ) : null,
    });

    const columns = canManage
      ? [displayName, email, permissions, actions]
      : [displayName, email, permissions];

    return {
      desktopColumns: columnHelper.columns(columns),
      mobileColumns: columnHelper.columns(columns),
    };
  }, [t, me.id, list, canManage, disabled]);

  const sortFields = useMemo<DataTableSortField<MemberRow>[]>(
    () => [
      { columnId: "displayName", label: t("feature.lists.column.name") },
      { columnId: "email", label: t("feature.lists.members.email") },
      { columnId: "permissions", label: t("feature.lists.members.role") },
    ],
    [t],
  );

  return { table, data, desktopColumns, mobileColumns, sortFields };
}

interface MembersColumns {
  desktopColumns: DataTableColumns<MemberRow>;
  mobileColumns: DataTableColumns<MemberRow>;
}
