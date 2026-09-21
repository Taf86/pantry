import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FilterIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  columnFilterValue,
  withColumnFilter,
  type DataTableColumnId,
  type DataTableFilterField,
  type DataTableFilterOption,
  type DataTableFiltersState,
  type DataTableFilterValue,
  type DataTableState,
} from "./data-table-core";

export function DataTableFilters<TData>({
  state,
  fields,
  className,
}: {
  state: DataTableState<TData>;
  fields: DataTableFilterField<TData>[];
  className?: string | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DataTableFiltersState<TData>>(
    state.columnFilters,
  );

  const activeCount = fields.filter(
    (field) =>
      columnFilterValue(state.columnFilters, field.columnId) !== undefined,
  ).length;

  const edit = (
    columnId: DataTableColumnId<TData>,
    value: DataTableFilterValue,
  ) => setDraft((current) => withColumnFilter(current, columnId, value));

  return (
    <Popover
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) setDraft(state.columnFilters);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("max-sm:px-1.5", className)}
          />
        }
        aria-label={t("feature.dataTable.filters")}
      >
        <FilterIcon data-icon="inline-start" />
        <span className="sr-only sm:not-sr-only">
          {t("feature.dataTable.filters")}
        </span>
        {activeCount > 0 && (
          <Badge className="h-4 min-w-4 px-1 text-[0.625rem]">
            {activeCount}
          </Badge>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="max-h-(--available-height) w-(--available-width) sm:w-80"
      >
        <PopoverHeader>
          <PopoverTitle>{t("feature.dataTable.filters")}</PopoverTitle>
        </PopoverHeader>

        {/* overflow-x-hidden: the checkboxes' extended hit area sticks out
            sideways and would otherwise add a horizontal scrollbar. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
          {fields.map((field) => (
            <FilterField
              key={field.columnId}
              field={field}
              value={columnFilterValue(draft, field.columnId)}
              onChange={(value) => edit(field.columnId, value)}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft([]);
              state.setColumnFilters([]);
            }}
          >
            {t("feature.dataTable.resetFilters")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              state.setColumnFilters(draft);
              setOpen(false);
            }}
          >
            {t("feature.dataTable.applyFilters")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterField<TData>({
  field,
  value,
  onChange,
}: {
  field: DataTableFilterField<TData>;
  value: DataTableFilterValue | undefined;
  onChange: (value: DataTableFilterValue) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      {field.filter.kind === "text" ? (
        <>
          <Label htmlFor={id} className="text-muted-foreground">
            {field.label}
          </Label>
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            placeholder={field.filter.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      ) : (
        <>
          <span id={id} className="text-xs leading-none text-muted-foreground">
            {field.label}
          </span>
          <OptionsField
            labelledBy={id}
            options={field.filter.options}
            selected={Array.isArray(value) ? value : []}
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
}

function OptionsField({
  labelledBy,
  options,
  selected,
  onChange,
}: {
  labelledBy: string;
  options: readonly DataTableFilterOption[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-col">
      {options.map((option) => (
        <Label
          key={option.value}
          className="gap-2 px-1 py-2 text-xs hover:bg-muted"
        >
          <Checkbox
            checked={selected.includes(option.value)}
            onCheckedChange={() => toggle(option.value)}
          />
          {option.label}
        </Label>
      ))}
    </div>
  );
}
