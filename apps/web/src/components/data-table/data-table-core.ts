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

/** Control a filter is edited with. */
export type DataTableFilter =
  | { kind: "text"; placeholder?: string }
  /** Multiple choice: the filter value is the array of the selected values. */
  | { kind: "options"; options: DataTableFilterOption[] };

export interface DataTableFilterOption {
  value: string;
  label: string;
}

/** A filter the table offers, declared next to the columns it belongs to. */
export interface DataTableFilterField {
  /** Column the filter applies to, matching the id in the column filters. */
  columnId: string;
  label: string;
  filter: DataTableFilter;
}

/** Type of `columnDef.meta` for every column of a data table. */
export interface DataTableColumnMeta {
  /** Aligns header and cells to the end of the row. */
  alignEnd?: boolean;
  /** Extra classes for the body cells of the column. */
  cellClassName?: string;
}

/** Phantom value: only its type is read, to type `columnDef.meta`. */
const columnMeta: DataTableColumnMeta = {};

/**
 * The features every data table registers. Client-side row models are included
 * so a table with local data works without further configuration; the `manual`
 * prop bypasses them when the server does the work instead.
 */
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

/**
 * Column helper bound to the data table features, so `meta` is typed as
 * `DataTableColumnMeta` and only the registered sort and filter functions can
 * be named.
 */
export const createDataTableColumnHelper = <TData extends RowData>() =>
  createColumnHelper<DataTableFeatures, TData>();

/** An empty filter is removed instead of matching everything. */
const isEmptyFilter = (value: unknown) =>
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/** Value of one column filter, `undefined` when the filter is not set. */
export const columnFilterValue = (
  columnFilters: ColumnFiltersState,
  columnId: string,
): unknown => columnFilters.find((filter) => filter.id === columnId)?.value;

/** Returns the filters with the one of `columnId` set to `value`. */
export const withColumnFilter = (
  columnFilters: ColumnFiltersState,
  columnId: string,
  value: unknown,
): ColumnFiltersState => {
  if (isEmptyFilter(value)) {
    return columnFilters.filter((filter) => filter.id !== columnId);
  }
  return columnFilters.some((filter) => filter.id === columnId)
    ? columnFilters.map((filter) =>
        filter.id === columnId ? { ...filter, value } : filter,
      )
    : [...columnFilters, { id: columnId, value }];
};

/** Sorting, filtering and pagination of a data table. */
export interface DataTableState {
  sorting: SortingState;
  setSorting: OnChangeFn<SortingState>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: OnChangeFn<ColumnFiltersState>;
  pagination: PaginationState;
  setPagination: OnChangeFn<PaginationState>;
}

/**
 * Owns the state of a data table outside of it, so the caller can put it in a
 * query key, in the url or wherever else it is needed.
 */
export function useDataTableState(initial?: {
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  pageSize?: number;
}): DataTableState {
  const [sorting, setSortingState] = useState<SortingState>(
    initial?.sorting ?? [],
  );
  const [columnFilters, setColumnFiltersState] = useState<ColumnFiltersState>(
    initial?.columnFilters ?? [],
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initial?.pageSize ?? DEFAULT_PAGE_SIZE,
  });

  // A different sorting or filter makes the current page meaningless: the row
  // that was on page 4 is somewhere else now, and the result may be shorter
  // than the page the table is on.
  const backToFirstPage = useCallback(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    );
  }, []);

  const setSorting = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      setSortingState(updater);
      backToFirstPage();
    },
    [backToFirstPage],
  );

  const setColumnFilters = useCallback<OnChangeFn<ColumnFiltersState>>(
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
