import { DEFAULT_PAGE_SIZE } from "@pantry/shared";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

export type DataTableColumnId<TData> = Extract<keyof TData, string>;
export interface DataTableColumnSort<TData> {
  id: DataTableColumnId<TData>;
  desc: boolean;
}
export type DataTableSortingState<TData> = DataTableColumnSort<TData>[];
export type DataTableFilterValue = string | string[];
export interface DataTableColumnFilter<TData> {
  id: DataTableColumnId<TData>;
  value: DataTableFilterValue;
}

export type DataTableFiltersState<TData> = DataTableColumnFilter<TData>[];

export type DataTableFilter<TValue extends string = string> =
  | { kind: "text"; placeholder?: string }
  | { kind: "options"; options: readonly DataTableFilterOption<TValue>[] };

export interface DataTableFilterOption<TValue extends string = string> {
  value: TValue;
  label: string;
}
export interface DataTableFilterField<TData, TValue extends string = string> {
  columnId: DataTableColumnId<TData>;
  label: string;
  filter: DataTableFilter<TValue>;
}
export interface DataTableSortField<TData> {
  columnId: DataTableColumnId<TData>;
  label: string;
}
export interface DataTableColumnMeta {
  alignEnd?: boolean;
  cellClassName?: string;
}

const columnMeta: DataTableColumnMeta = {};

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumns<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData
>[];

export const createDataTableColumnHelper = <TData extends RowData>() =>
  createColumnHelper<DataTableFeatures, TData>();

const isEmptyFilter = (value: DataTableFilterValue) =>
  value === "" || (Array.isArray(value) && value.length === 0);

export const columnFilterValue = <TData>(
  columnFilters: DataTableFiltersState<TData>,
  columnId: DataTableColumnId<TData>,
): DataTableFilterValue | undefined =>
  columnFilters.find((filter) => filter.id === columnId)?.value;

export const withColumnFilter = <TData>(
  columnFilters: DataTableFiltersState<TData>,
  columnId: DataTableColumnId<TData>,
  value: DataTableFilterValue,
): DataTableFiltersState<TData> => {
  if (isEmptyFilter(value)) {
    return columnFilters.filter((filter) => filter.id !== columnId);
  }
  return columnFilters.some((filter) => filter.id === columnId)
    ? columnFilters.map((filter) =>
        filter.id === columnId ? { ...filter, value } : filter,
      )
    : [...columnFilters, { id: columnId, value }];
};

export const textFilterValue = <TData>(
  columnFilters: DataTableFiltersState<TData>,
  columnId: DataTableColumnId<TData>,
): string | undefined => {
  const value = columnFilterValue(columnFilters, columnId);
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
};

export const optionsFilterValue = <TData, TValue extends string>(
  columnFilters: DataTableFiltersState<TData>,
  columnId: DataTableColumnId<TData>,
  allowed: readonly TValue[],
): TValue[] => {
  const value = columnFilterValue(columnFilters, columnId);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is TValue =>
    (allowed as readonly string[]).includes(entry),
  );
};

export interface DataTableState<TData> {
  sorting: DataTableSortingState<TData>;
  setSorting: OnChangeFn<DataTableSortingState<TData>>;
  columnFilters: DataTableFiltersState<TData>;
  setColumnFilters: OnChangeFn<DataTableFiltersState<TData>>;
  pagination: PaginationState;
  setPagination: OnChangeFn<PaginationState>;
}

export const dataTableStateOptions = <TData>(
  state: DataTableState<TData>,
  pagination: PaginationState,
) => ({
  state: {
    sorting: state.sorting satisfies SortingState,
    columnFilters: state.columnFilters satisfies ColumnFiltersState,
    pagination,
  },
  onSortingChange: state.setSorting as unknown as OnChangeFn<SortingState>,
  onColumnFiltersChange:
    state.setColumnFilters as unknown as OnChangeFn<ColumnFiltersState>,
});

export function useDataTableState<TData>(initial?: {
  sorting?: DataTableSortingState<TData>;
  columnFilters?: DataTableFiltersState<TData>;
  pageSize?: number;
}): DataTableState<TData> {
  const [sorting, setSortingState] = useState<DataTableSortingState<TData>>(
    initial?.sorting ?? [],
  );
  const [columnFilters, setColumnFiltersState] = useState<
    DataTableFiltersState<TData>
  >(initial?.columnFilters ?? []);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initial?.pageSize ?? DEFAULT_PAGE_SIZE,
  });

  const backToFirstPage = useCallback(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    );
  }, []);

  const setSorting = useCallback<OnChangeFn<DataTableSortingState<TData>>>(
    (updater) => {
      setSortingState(updater);
      backToFirstPage();
    },
    [backToFirstPage],
  );

  const setColumnFilters = useCallback<
    OnChangeFn<DataTableFiltersState<TData>>
  >(
    (updater) => {
      setColumnFiltersState(updater);
      backToFirstPage();
    },
    [backToFirstPage],
  );

  return useMemo(
    () => ({
      sorting,
      setSorting,
      columnFilters,
      setColumnFilters,
      pagination,
      setPagination,
    }),
    [sorting, setSorting, columnFilters, setColumnFilters, pagination],
  );
}
