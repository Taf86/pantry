import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PAGE_SIZE_OPTIONS } from "@pantry/shared";
import {
  useTable,
  type RowData,
  type SortDirection,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  dataTableFeatures,
  type DataTableColumns,
  type DataTableFeatures,
  type DataTableState,
} from "./data-table-core";

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumns<TData>;
  /** In manual mode this is the page to show, otherwise the whole data set. */
  data: TData[];
  state: DataTableState;
  /**
   * Sorting, filtering and pagination are applied by the server: the table
   * shows `data` as it is and needs `rowCount` to know how many pages there
   * are. Without it the table processes the rows itself.
   */
  manual?: boolean | undefined;
  /** Rows the filters match, over every page. Required when `manual`. */
  rowCount?: number | undefined;
  getRowId?: ((row: TData) => string) | undefined;
  /** First load: there is nothing to show yet. */
  isPending?: boolean | undefined;
  /** Reload of a page that is already on screen. */
  isFetching?: boolean | undefined;
  emptyMessage?: string | undefined;
  pageSizeOptions?: readonly number[] | undefined;
  className?: string | undefined;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  state,
  manual = false,
  rowCount,
  getRowId,
  isPending = false,
  isFetching = false,
  emptyMessage,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className,
}: DataTableProps<TData>) {
  const { t } = useTranslation();

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    columns,
    data,
    // `exactOptionalPropertyTypes` rules out passing these as `undefined`.
    ...(getRowId && { getRowId }),
    ...(rowCount !== undefined && { rowCount }),
    manualSorting: manual,
    manualFiltering: manual,
    manualPagination: manual,
    // Every page of a manual table is a new `data`, which would otherwise be
    // read as a data set change and send the table back to the first page.
    autoResetPageIndex: !manual,
    state: {
      sorting: state.sorting,
      columnFilters: state.columnFilters,
      pagination: state.pagination,
    },
    onSortingChange: state.setSorting,
    onColumnFiltersChange: state.setColumnFilters,
    onPaginationChange: state.setPagination,
  });

  const headerGroups = table.getHeaderGroups();
  const leafHeaders = headerGroups.at(-1)?.headers ?? [];
  const rows = table.getRowModel().rows;
  const { pageIndex, pageSize } = state.pagination;
  const pageCount = Math.max(table.getPageCount(), 1);

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <Table>
        <TableHeader>
          {headerGroups.map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const { column } = header;
                const sorted = column.getIsSorted();
                const canSort = column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    aria-sort={canSort ? ariaSort(sorted) : undefined}
                    className={cn(
                      column.columnDef.meta?.alignEnd && "text-end",
                    )}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="-mx-2 font-medium"
                        onClick={column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        <SortIcon direction={sorted} />
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody
          aria-busy={isPending || isFetching}
          className={cn(
            "transition-opacity",
            isFetching && !isPending && "opacity-50",
          )}
        >
          {isPending ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={leafHeaders.length} className="h-24">
                <div className="flex items-center justify-center">
                  <Spinner />
                </div>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={leafHeaders.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage ?? t("common.dataTable.empty")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        meta?.alignEnd && "text-end",
                        meta?.cellClassName,
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {t("common.dataTable.total", { count: table.getRowCount() })}
        </span>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="xs" />}
              aria-label={t("common.dataTable.pageSize")}
            >
              {t("common.dataTable.pageSize")}: {pageSize}
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-24">
              <DropdownMenuRadioGroup
                value={pageSize}
                onValueChange={(value: unknown) => {
                  if (typeof value === "number") table.setPageSize(value);
                }}
              >
                {pageSizeOptions.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {option}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <span>
            {t("common.dataTable.page", { page: pageIndex + 1, pageCount })}
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={t("common.dataTable.firstPage")}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.firstPage()}
            >
              <ChevronsLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={t("common.dataTable.previousPage")}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={t("common.dataTable.nextPage")}
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={t("common.dataTable.lastPage")}
              disabled={!table.getCanNextPage()}
              onClick={() => table.lastPage()}
            >
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ariaSort(sorted: false | SortDirection) {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

function SortIcon({ direction }: { direction: false | SortDirection }) {
  if (direction === "asc") return <ArrowUpIcon data-icon="inline-end" />;
  if (direction === "desc") return <ArrowDownIcon data-icon="inline-end" />;
  return <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />;
}
