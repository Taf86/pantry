import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  DataTableColumnId,
  DataTableSortField,
  DataTableState,
} from "./data-table-core";

export function DataTableSort<TData>({
  state,
  fields,
  className,
}: {
  state: DataTableState<TData>;
  fields: DataTableSortField<TData>[];
  className?: string | undefined;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) return null;

  const active = state.sorting[0];

  const sortBy = (columnId: DataTableColumnId<TData>, desc: boolean) => {
    state.setSorting([{ id: columnId, desc }]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("max-sm:px-1.5", className)}
          />
        }
        aria-label={t("feature.dataTable.sort")}
      >
        <ArrowUpDownIcon data-icon="inline-start" />
        <span className="sr-only sm:not-sr-only">
          {t("feature.dataTable.sort")}
        </span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-(--available-width) sm:w-80">
        <PopoverHeader>
          <PopoverTitle>{t("feature.dataTable.sort")}</PopoverTitle>
        </PopoverHeader>

        <div className="flex flex-col gap-1">
          {fields.map((field) => {
            const current =
              active && active.id === field.columnId ? active : undefined;
            const direction = current ? (current.desc ? "desc" : "asc") : null;

            return (
              <div
                key={field.columnId}
                className="flex items-center justify-between gap-2"
              >
                <span className={cn(current && "font-medium")}>
                  {field.label}
                </span>
                <ToggleGroup
                  value={direction === null ? [] : [direction]}
                  // Re-pressing the active direction clears the group value:
                  // ignore it, the column stays sorted the way it is.
                  onValueChange={(next: unknown[]) => {
                    const [value] = next;
                    if (value === "asc" || value === "desc") {
                      sortBy(field.columnId, value === "desc");
                    }
                  }}
                  size="sm"
                  spacing={1}
                  className="shrink-0"
                >
                  <ToggleGroupItem
                    value="asc"
                    aria-label={`${field.label}: ${t("feature.dataTable.sortAscending")}`}
                  >
                    <ArrowUpIcon />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="desc"
                    aria-label={`${field.label}: ${t("feature.dataTable.sortDescending")}`}
                  >
                    <ArrowDownIcon />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
