import { FormField } from "@/components/form-field";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import useErrorMessage from "@/hooks/use-error-message";
import { requestFormKeys } from "@/lib/requests";
import { trpc, type ApiError } from "@/lib/trpc";
import { requiredString } from "@/lib/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_NAME_LENGTH,
  RequestType,
  type CreateRequestInput,
} from "@pantry/shared";
import { useMutation } from "@tanstack/react-query";
import { AlertCircleIcon, CheckCircle2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import z from "zod";

/**
 * The public side of the queue: it asks for an account or for a new password
 * link, and an administrator decides. It never says whether the address is
 * known — the answer is the same either way.
 */
export default function RequestPage({ type }: { type: RequestType }) {
  const { t } = useTranslation();
  const signup = type === RequestType.signup;
  const copy = requestFormKeys[type];

  const apiErrorMessage = (apiError: ApiError) =>
    apiError.data?.code === "TOO_MANY_REQUESTS"
      ? t("feature.request.tooMany")
      : null;
  const errorMessage = useErrorMessage(apiErrorMessage);

  const [error, setError] = useState<string | null>(null);

  const formSchema = z.object({
    email: z.email(),
    displayName: signup ? requiredString(t).max(MAX_NAME_LENGTH) : z.string(),
  });
  type Values = z.infer<typeof formSchema>;

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", displayName: "" },
  });

  const create = useMutation({
    mutationFn: (input: CreateRequestInput) =>
      trpc.account.createRequest.mutate(input),
    networkMode: "online",
    onError: (cause: unknown) => setError(errorMessage(cause)),
  });

  const onValid: SubmitHandler<Values, unknown> = (data, event) => {
    event?.preventDefault();
    setError(null);
    create.mutate(
      signup
        ? {
            type: RequestType.signup,
            email: data.email,
            displayName: data.displayName,
          }
        : { type: RequestType.reset_password, email: data.email },
    );
  };

  if (create.isSuccess) {
    return (
      <div className="flex w-full max-w-md flex-col gap-6">
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          Pantry
        </h1>
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{t("feature.request.sent")}</AlertTitle>
          <AlertDescription>{t(copy.done)}</AlertDescription>
        </Alert>
        <Field orientation="horizontal">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            {t("feature.request.backToLogin")}
          </Button>
        </Field>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium tracking-tight">
        Pantry
      </h1>

      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t(copy.title)}</FieldLegend>
            <FieldDescription>{t(copy.description)}</FieldDescription>
            <FieldGroup>
              {signup && (
                <FormField
                  name="displayName"
                  control={form.control}
                  label={t("feature.request.name")}
                >
                  {({ field, invalid }) => (
                    <Input
                      {...field}
                      id={field.name}
                      aria-invalid={invalid}
                      autoComplete="name"
                    />
                  )}
                </FormField>
              )}

              <FormField
                name="email"
                control={form.control}
                label={t("feature.request.email")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                )}
              </FormField>
            </FieldGroup>
          </FieldSet>

          {error !== null && (
            <Field orientation="horizontal">
              <Alert variant="destructive" className="max-w-md">
                <AlertAction>
                  <XIcon aria-hidden="true" onClick={() => setError(null)} />
                </AlertAction>
                <AlertCircleIcon />
                <AlertTitle>{t("feature.request.failed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </Field>
          )}

          <Field orientation="horizontal" className="flex-wrap">
            <Button type="submit" disabled={create.isPending}>
              {t("feature.request.submit")}
            </Button>
            <Button
              variant="link"
              size="sm"
              nativeButton={false}
              render={<Link to="/login" />}
            >
              {t("feature.request.backToLogin")}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
