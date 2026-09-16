import { Button } from "@/components/ui/button";
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
import type { ColumnFiltersState } from "@tanstack/react-table";
import { CheckIcon, FilterIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  columnFilterValue,
  withColumnFilter,
  type DataTableFilterField,
  type DataTableFilterOption,
  type DataTableState,
} from "./data-table-core";

/** Delay before a typed filter is committed, to not query on every keystroke. */
const FILTER_DEBOUNCE_MS = 300;

/**
 * Single text filter, committed as the user types. Meant to be put next to the
 * title of a page as the quick search of the table.
 */
export function DataTableTextFilter({
  state,
  columnId,
  label,
  placeholder,
  className,
}: {
  state: DataTableState;
  columnId: string;
  label: string;
  placeholder?: string | undefined;
  className?: string | undefined;
}) {
  const value = asText(columnFilterValue(state.columnFilters, columnId));
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follows the value when it is changed from the outside, for instance from
  // the filter panel or on a reset.
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }

  // A change coming from elsewhere supersedes an edit still waiting to be
  // committed; the same cleanup drops it when the filter goes away.
  useEffect(() => () => clearTimeout(timer.current), [value]);

  const commitLater = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCommitted(next);
      state.setColumnFilters((current) =>
        withColumnFilter(current, columnId, next),
      );
    }, FILTER_DEBOUNCE_MS);
  };

  return (
    <Input
      value={draft}
      placeholder={placeholder ?? label}
      aria-label={label}
      onChange={(event) => commitLater(event.target.value)}
      className={cn("h-7", className)}
    />
  );
}

/**
 * Button that opens every filter of the table in a panel, full screen on
 * phones. The edits are staged and only reach the table on apply, so a panel
 * full of filters costs one query instead of one per field.
 */
export function DataTableFilters({
  state,
  fields,
  className,
}: {
  state: DataTableState;
  fields: DataTableFilterField[];
  className?: string | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnFiltersState>(state.columnFilters);

  const activeCount = fields.filter(
    (field) =>
      columnFilterValue(state.columnFilters, field.columnId) !== undefined,
  ).length;

  const edit = (columnId: string, value: unknown) =>
    setDraft((current) => withColumnFilter(current, columnId, value));

  return (
    <Popover
      open={open}
      onOpenChange={(next: boolean) => {
        // Always start from what the table is actually filtered by.
        if (next) setDraft(state.columnFilters);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className={className} />}
        aria-label={t("common.dataTable.filters")}
      >
        <FilterIcon data-icon="inline-start" />
        <span className="sr-only sm:not-sr-only">
          {t("common.dataTable.filters")}
        </span>
        {activeCount > 0 && (
          <span className="inline-flex size-4 items-center justify-center bg-primary text-[0.625rem] text-primary-foreground">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="h-(--available-height) w-(--available-width) sm:h-auto sm:w-80"
      >
        <PopoverHeader>
          <PopoverTitle>{t("common.dataTable.filters")}</PopoverTitle>
        </PopoverHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
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
            {t("common.dataTable.resetFilters")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              state.setColumnFilters(draft);
              setOpen(false);
            }}
          >
            {t("common.dataTable.applyFilters")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterField({
  field,
  value,
  onChange,
}: {
  field: DataTableFilterField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground">
        {field.label}
      </Label>
      {field.filter.kind === "text" ? (
        <Input
          id={id}
          value={asText(value)}
          placeholder={field.filter.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <OptionsField
          id={id}
          options={field.filter.options}
          selected={asOptionValues(value)}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function OptionsField({
  id,
  options,
  selected,
  onChange,
}: {
  id: string;
  options: DataTableFilterOption[];
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
    <div id={id} className="flex flex-col">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => toggle(option.value)}
            className="flex items-center gap-2 px-1 py-1.5 text-start text-xs hover:bg-muted"
          >
            <span className="flex size-4 shrink-0 items-center justify-center border border-input">
              {checked && <CheckIcon className="size-3" />}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const asText = (value: unknown) => (typeof value === "string" ? value : "");

const asOptionValues = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string")
    : [];
