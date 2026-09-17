import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useTable, type RowData } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  dataTableFeatures,
  dataTableStateOptions,
  type DataTableColumns,
  type DataTableFeatures,
  type DataTableState,
} from "./data-table-core";

export interface MobileDataTableProps<TData extends RowData> {
  columns: DataTableColumns<TData>;
  data: TData[];
  state: DataTableState<TData>;
  manual?: boolean | undefined;
  rowCount?: number | undefined;
  getRowId?: ((row: TData) => string) | undefined;
  isPending?: boolean | undefined;
  isFetching?: boolean | undefined;
  emptyMessage?: string | undefined;
  className?: string | undefined;
}

export function MobileDataTable<TData extends RowData>({
  columns,
  data,
  state,
  manual = false,
  rowCount,
  getRowId,
  isPending = false,
  isFetching = false,
  emptyMessage,
  className,
}: MobileDataTableProps<TData>) {
  const { t } = useTranslation();
  const { pageIndex, pageSize } = state.pagination;
  const loadedRows = useLoadedRows(data, state, manual, isFetching);

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    columns,
    data: loadedRows,
    ...(getRowId && { getRowId }),
    ...(rowCount !== undefined && { rowCount }),
    manualSorting: manual,
    manualFiltering: manual,
    manualPagination: manual,
    autoResetPageIndex: false,
    ...dataTableStateOptions(state, {
      pageIndex: 0,
      pageSize: pageSize * (pageIndex + 1),
    }),
  });

  const headers = new Map(
    (table.getHeaderGroups().at(-1)?.headers ?? []).map((header) => [
      header.column.id,
      header,
    ]),
  );
  const rows = table.getRowModel().rows;
  const total = table.getRowCount();
  const loaded = rows.length;

  const loadMore = () =>
    state.setPagination((current) => ({
      ...current,
      pageIndex: current.pageIndex + 1,
    }));

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div
        aria-busy={isPending || isFetching}
        className={cn(
          "border-t border-border text-xs transition-opacity",
          isFetching && !isPending && "opacity-50",
        )}
      >
        {isPending ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">
            {emptyMessage ?? t("feature.dataTable.empty")}
          </div>
        ) : (
          rows.map((row) => {
            const cells = row.getAllCells();
            const [title, ...rest] = cells;
            const trailing = rest.filter(
              (cell) => cell.column.columnDef.meta?.alignEnd,
            );
            const fields = rest.filter(
              (cell) => !cell.column.columnDef.meta?.alignEnd,
            );

            return (
              <div
                key={row.id}
                className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-2">
                  {title && (
                    <span
                      className={cn(
                        "text-sm font-medium",
                        title.column.columnDef.meta?.cellClassName,
                      )}
                    >
                      <table.FlexRender cell={title} />
                    </span>
                  )}
                  {trailing.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1">
                      {trailing.map((cell) => (
                        <table.FlexRender key={cell.id} cell={cell} />
                      ))}
                    </span>
                  )}
                </div>

                {fields.length > 0 && (
                  <dl className="flex flex-col gap-1">
                    {fields.map((cell) => {
                      const header = headers.get(cell.column.id);
                      return (
                        <div
                          key={cell.id}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <dt className="text-muted-foreground">
                            {header && !header.isPlaceholder && (
                              <table.FlexRender header={header} />
                            )}
                          </dt>
                          <dd
                            className={cn(
                              "text-end",
                              cell.column.columnDef.meta?.cellClassName,
                            )}
                          >
                            <table.FlexRender cell={cell} />
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{t("feature.dataTable.loaded", { loaded, total })}</span>
        {loaded < total && (
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={loadMore}
          >
            {isFetching && (
              <Spinner data-icon="inline-start" className="size-3" />
            )}
            {t("feature.dataTable.loadMore")}
          </Button>
        )}
      </div>
    </div>
  );
}

interface LoadedPages<TData> {
  signature: string;
  pages: Record<number, TData[]>;
  rows: TData[];
}

function useLoadedRows<TData>(
  data: TData[],
  state: DataTableState<TData>,
  manual: boolean,
  isFetching: boolean,
): TData[] {
  const { pageIndex, pageSize } = state.pagination;
  const { setPagination } = state;
  const signature = JSON.stringify([
    state.sorting,
    state.columnFilters,
    pageSize,
  ]);
  const [loaded, setLoaded] = useState<LoadedPages<TData>>({
    signature,
    pages: {},
    rows: [],
  });

  const known = loaded.pages[pageIndex];
  const refreshed =
    manual &&
    !isFetching &&
    known !== undefined &&
    known !== data &&
    Object.keys(loaded.pages).length > 1;

  useEffect(() => {
    if (!refreshed) return;
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    );
  }, [refreshed, setPagination]);

  if (!manual) return data;

  let current = loaded;
  if (current.signature !== signature) {
    current = { signature, pages: {}, rows: [] };
  } else if (refreshed) {
    current = { signature, pages: {}, rows: current.rows };
  } else if (!isFetching && known !== data) {
    const pages = { ...current.pages, [pageIndex]: data };
    current = { signature, pages, rows: concatPages(pages) };
  }
  if (current !== loaded) setLoaded(current);

  return current.rows;
}

const concatPages = <TData,>(pages: Record<number, TData[]>): TData[] =>
  Object.keys(pages)
    .map(Number)
    .sort((first, second) => first - second)
    .flatMap((index) => pages[index] ?? []);
