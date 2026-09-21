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
import { formatDateTime } from "@/lib/dates";
import { requestStatusLabelKeys, requestTypeLabelKeys } from "@/lib/requests";
import {
  RequestSortFields,
  RequestStatus,
  RequestStatuses,
  RequestTypes,
  type ApproveRequestResult,
  type ListRequestsFilters,
  type ListRequestsInput,
  type RequestExtended,
  type RequestSort,
  type RequestSortField,
} from "@pantry/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RequestStatusBadge, RequestTypeBadge } from "./request-badges";
import RequestActions from "./request-actions";

const columnHelper = createDataTableColumnHelper<RequestExtended>();

export default function useRequestsTable({
  onApproved,
}: {
  onApproved: (approved: ApproveRequestResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const table = useDataTableState<RequestExtended>({
    sorting: [{ id: "createdAt", desc: true }],
  });

  const { desktopColumns, mobileColumns } = useMemo<RequestsColumns>(() => {
    const email = columnHelper.accessor("email", {
      header: t("feature.requests.column.email"),
    });

    const displayName = columnHelper.accessor("displayName", {
      header: t("feature.requests.column.name"),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() ?? "—"}</span>
      ),
    });

    const type = columnHelper.accessor("type", {
      header: t("feature.requests.column.type"),
      cell: ({ getValue }) => <RequestTypeBadge type={getValue()} />,
    });

    const status = columnHelper.accessor("status", {
      header: t("feature.requests.column.status"),
      cell: ({ getValue }) => <RequestStatusBadge status={getValue()} />,
    });

    const createdAt = columnHelper.accessor("createdAt", {
      header: t("feature.requests.column.createdAt"),
      cell: ({ getValue }) => formatDateTime(getValue(), locale),
    });

    const decidedBy = columnHelper.accessor("decidedBy", {
      header: t("feature.requests.column.decidedBy"),
      cell: ({ getValue }) => getValue()?.displayName ?? "—",
    });

    const actions = columnHelper.display({
      id: "actions",
      header: t("feature.requests.column.actions"),
      meta: { alignEnd: true },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {/* A decided request is history: there is nothing left to do to it. */}
          {row.original.status === RequestStatus.pending && (
            <RequestActions request={row.original} onApproved={onApproved} />
          )}
        </div>
      ),
    });

    return {
      desktopColumns: columnHelper.columns([
        email,
        displayName,
        type,
        status,
        createdAt,
        decidedBy,
        actions,
      ]),
      mobileColumns: columnHelper.columns([
        email,
        type,
        status,
        createdAt,
        actions,
      ]),
    };
  }, [t, locale, onApproved]);

  const sortFields = useMemo<DataTableSortField<RequestExtended>[]>(
    () => [
      { columnId: "email", label: t("feature.requests.column.email") },
      { columnId: "type", label: t("feature.requests.column.type") },
      { columnId: "status", label: t("feature.requests.column.status") },
      { columnId: "createdAt", label: t("feature.requests.column.createdAt") },
    ],
    [t],
  );

  const filterFields = useMemo<DataTableFilterField<RequestExtended>[]>(
    () => [
      {
        columnId: "email",
        label: t("feature.requests.column.email"),
        filter: { kind: "text" },
      },
      {
        columnId: "type",
        label: t("feature.requests.column.type"),
        filter: {
          kind: "options",
          options: RequestTypes.map((type) => ({
            value: type,
            label: t(requestTypeLabelKeys[type]),
          })),
        },
      },
      {
        columnId: "status",
        label: t("feature.requests.column.status"),
        filter: {
          kind: "options",
          options: RequestStatuses.map((status) => ({
            value: status,
            label: t(requestStatusLabelKeys[status]),
          })),
        },
      },
    ],
    [t],
  );

  const input = useMemo<ListRequestsInput>(
    () => ({
      pagination: table.pagination,
      sorting: toRequestSorting(table.sorting),
      filters: toRequestFilters(table.columnFilters),
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

type RequestsColumns = {
  desktopColumns: DataTableColumns<RequestExtended>;
  mobileColumns: DataTableColumns<RequestExtended>;
};

const isRequestSortField = (id: string): id is RequestSortField =>
  (RequestSortFields as readonly string[]).includes(id);

const toRequestSorting = (
  sorting: DataTableSortingState<RequestExtended>,
): RequestSort[] =>
  sorting.filter((sort): sort is RequestSort => isRequestSortField(sort.id));

const toRequestFilters = (
  columnFilters: DataTableFiltersState<RequestExtended>,
): ListRequestsFilters => {
  const email = textFilterValue(columnFilters, "email");
  const type = optionsFilterValue(columnFilters, "type", RequestTypes);
  const status = optionsFilterValue(columnFilters, "status", RequestStatuses);

  return {
    ...(email !== undefined && { email }),
    ...(type.length > 0 && { type }),
    ...(status.length > 0 && { status }),
  };
};
