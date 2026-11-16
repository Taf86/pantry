import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
