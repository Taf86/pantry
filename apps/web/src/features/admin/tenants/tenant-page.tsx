import { FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import ErrorPage from "@/components/errors/error-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import useErrorMessage from "@/hooks/use-error-message";
import { keys } from "@/lib/keys";
import { trpc, type ApiError } from "@/lib/trpc";
import { requiredString } from "@/lib/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { MAX_NAME_LENGTH } from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import z from "zod";
import useTenants from "./use-tenants";

const tenantsPath = "/admin/tenants";

export default function TenantPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { tenantId } = useParams<{ tenantId: string }>();
  const editing = tenantId !== undefined;

  const { tenants } = useTenants();
  const tenant = editing
    ? tenants.data?.find((row) => row.id === tenantId)
    : undefined;

  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "CONFLICT":
        return t("feature.tenants.form.nameInUse");
      case "NOT_FOUND":
        return t("feature.tenants.notFound");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);
  const [error, setError] = useState<string | null>(null);

  const formSchema = z.object({
    name: requiredString(t).max(MAX_NAME_LENGTH),
  });
  type Values = z.infer<typeof formSchema>;

  const loaded = useMemo<Values | undefined>(
    () => tenant && { name: tenant.name },
    [tenant],
  );

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
    ...(loaded && { values: loaded }),
  });

  const save = useMutation({
    mutationFn: (input: Values) =>
      editing
        ? trpc.admin.tenants.update.mutate({
            tenantId: tenantId ?? "",
            name: input.name,
          })
        : trpc.admin.tenants.create.mutate({ name: input.name }),
    networkMode: "online",
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.adminTenants() });
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
      await navigate(tenantsPath);
    },
    onError: (cause: unknown) => setError(errorMessage(cause)),
  });

  const onValid: SubmitHandler<Values, unknown> = (data, event) => {
    event?.preventDefault();
    setError(null);
    save.mutate(data);
  };

  if (editing && tenants.isPending) return <Loader />;
  if (editing && !tenant) {
    return (
      <ErrorPage
        title={t("feature.tenants.notFoundTitle")}
        description={t("feature.tenants.notFound")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-medium">
        {t(
          editing
            ? "feature.tenants.form.editTitle"
            : "feature.tenants.form.createTitle",
        )}
      </h1>

      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet className="max-w-md">
            <FieldDescription>
              {t(
                editing
                  ? "feature.tenants.form.editDescription"
                  : "feature.tenants.form.createDescription",
              )}
            </FieldDescription>
            <FieldGroup>
              <FormField
                name="name"
                control={form.control}
                label={t("feature.tenants.form.name")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    autoComplete="off"
                  />
                )}
              </FormField>
            </FieldGroup>

            {error !== null && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>
                  {t(
                    editing
                      ? "feature.tenants.form.editFailed"
                      : "feature.tenants.form.createFailed",
                  )}
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field orientation="horizontal">
              <Button type="submit" disabled={save.isPending}>
                {t(
                  editing
                    ? "feature.tenants.form.save"
                    : "feature.tenants.form.create",
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void navigate(tenantsPath)}
              >
                {t("feature.tenants.form.cancel")}
              </Button>
            </Field>
          </FieldSet>
        </FieldGroup>
      </form>
    </div>
  );
}
