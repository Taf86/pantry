import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import useTenants from "./use-tenants";

export default function TenantSelect({
  id,
  value,
  onChange,
  onBlur,
  ref,
  invalid,
  disabled,
  fallbackItems,
}: {
  id?: string;
  value: string;
  onChange: (tenantId: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  invalid?: boolean;
  disabled?: boolean;
  /** Labels to show before the list loads, e.g. the tenant of the user being edited. */
  fallbackItems?: Record<string, string> | undefined;
}) {
  const { t } = useTranslation();
  const { tenants, tenantItems } = useTenants();
  const items = { ...fallbackItems, ...tenantItems };

  return (
    <Select
      items={items}
      value={value === "" ? null : value}
      onValueChange={(next) => onChange(next ?? "")}
      disabled={disabled === true || tenants.isPending}
    >
      <SelectTrigger
        id={id}
        ref={ref}
        onBlur={onBlur}
        aria-invalid={invalid}
        className="w-full"
      >
        <SelectValue placeholder={t("feature.tenants.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {(tenants.data ?? []).map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id}>
            {tenant.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
