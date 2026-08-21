import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";

type FormFieldProps<T extends FieldValues, N extends FieldPath<T>> = {
  control: Control<T>;
  name: N;
  label: string;
  description?: string;
  children: (props: {
    field: ControllerRenderProps<T, N>;
    invalid: boolean;
  }) => React.ReactNode;
};

export const FormField = <T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  children,
}: FormFieldProps<T, N>) => (
  <Controller
    control={control}
    name={name}
    render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {children({ field, invalid: fieldState.invalid })}
        {description && <FieldDescription>{description}</FieldDescription>}
        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
      </Field>
    )}
  />
);
