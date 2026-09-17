import { useIsMobile } from "@/hooks/use-is-mobile";
import type { RowData } from "@tanstack/react-table";
import { useEffect, useRef } from "react";
import type { DataTableColumns, DataTableState } from "./data-table-core";
import { DesktopDataTable } from "./desktop-data-table";
import { MobileDataTable } from "./mobile-data-table";

interface DataTableBaseProps<TData extends RowData> {
  data: TData[];
  state: DataTableState<TData>;
  manual?: boolean | undefined;
  rowCount?: number | undefined;
  getRowId?: ((row: TData) => string) | undefined;
  isPending?: boolean | undefined;
  isFetching?: boolean | undefined;
  emptyMessage?: string | undefined;
  pageSizeOptions?: readonly number[] | undefined;
  className?: string | undefined;
}

type DataTableColumnsProps<TData extends RowData> =
  | {
      desktopColumns: DataTableColumns<TData>;
      mobileColumns?: DataTableColumns<TData> | undefined;
    }
  | {
      desktopColumns?: DataTableColumns<TData> | undefined;
      mobileColumns: DataTableColumns<TData>;
    };

export type DataTableProps<TData extends RowData> = DataTableBaseProps<TData> &
  DataTableColumnsProps<TData>;

export function DataTable<TData extends RowData>(props: DataTableProps<TData>) {
  const {
    desktopColumns,
    mobileColumns,
    pageSizeOptions,
    ...shared
  }: DataTableBaseProps<TData> & {
    desktopColumns?: DataTableColumns<TData> | undefined;
    mobileColumns?: DataTableColumns<TData> | undefined;
  } = props;

  const isMobile = useIsMobile();
  const mobile =
    mobileColumns !== undefined && (isMobile || desktopColumns === undefined);

  const { setPagination } = shared.state;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    );
  }, [mobile, setPagination]);

  if (mobile && mobileColumns) {
    return <MobileDataTable columns={mobileColumns} {...shared} />;
  }

  if (desktopColumns) {
    return (
      <DesktopDataTable
        columns={desktopColumns}
        {...shared}
        {...(pageSizeOptions && { pageSizeOptions })}
      />
    );
  }

  return null;
}
