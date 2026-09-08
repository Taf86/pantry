import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MIN_PASSWORD_LENGTH, type InvitePreview } from "@pantry/shared";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { signIn } from "../../lib/auth-client";
import { keys } from "../../lib/keys";
import { trpc, type ApiError } from "../../lib/trpc";
import { toast } from "@/components/ui/toast";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm, type SubmitHandler } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormField } from "@/components/form-field";
import { useTranslation } from "react-i18next";
import useErrorMessage from "@/hooks/use-error-message";
import Loader from "@/components/loader";
import ErrorPage from "@/components/errors/error-page";

export default function InvitePage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();

  const preview = useQuery({
    queryKey: keys.invitePreview(token),
    queryFn: () => trpc.account.invitePreview.query({ token }),
    retry: false,
    networkMode: "online",
  });

  if (preview.isPending) {
    return <Loader />;
  }

  if (preview.isError || !preview.data) {
    return (
      <ErrorPage
        title={t("feature.invite.error.expiredOrInvalidLinkTitle")}
        description={t("feature.invite.error.expiredOrInvalidLink")}
      />
    );
  }

  return <Form invite={preview.data} token={token} />;
}

function Form({ invite, token }: { invite: InvitePreview; token: string }) {
  const { t } = useTranslation();
  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "NOT_FOUND":
        return t("feature.invite.error.expiredOrInvalidLink");
      case "FORBIDDEN":
        return t("feature.invite.error.forbidden");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);

  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const formSchema = z
    .object({
      password: z.string().trim().min(MIN_PASSWORD_LENGTH),
      confirmation: z.string(),
    })
    .check((ctx) => {
      const { password, confirmation } = ctx.value;
      if (confirmation !== password) {
        ctx.issues.push({
          path: ["confirmation"],
          code: "custom",
          message: t("feature.invite.error.confirmation"),
          input: confirmation,
        });
      }
    });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { confirmation: "", password: "" },
  });

  const accept = useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      trpc.account.acceptInvite.mutate(input),
    networkMode: "online",
    onSuccess: async (result, variables) => {
      const signedIn = await signIn(result.email, variables.password);
      if (signedIn.error) {
        toast.add({ description: t("feature.invite.manualLogin") });
        void navigate("/login", { replace: true });
        return;
      }
      await client.invalidateQueries({ queryKey: keys.me() });
      void navigate("/lists", { replace: true });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const onValid: SubmitHandler<z.infer<typeof formSchema>, unknown> = (
    data,
    event,
  ) => {
    event?.preventDefault();
    setError(null);
    accept.mutate({ token, password: data.password });
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("feature.invite.signUp")}</FieldLegend>
            <FieldDescription>
              {t("feature.invite.welcome", {
                displayName: invite.displayName,
                email: invite.email,
              })}
            </FieldDescription>
            <FieldGroup>
              <FormField
                name="password"
                control={form.control}
                label={t("feature.invite.password")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="password"
                  />
                )}
              </FormField>

              <FormField
                name="confirmation"
                control={form.control}
                label={t("feature.invite.confirmation")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="password"
                  />
                )}
              </FormField>
            </FieldGroup>
          </FieldSet>

          {error !== null && (
            <Field orientation="horizontal">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircleIcon />
                <AlertTitle>{t("feature.invite.failed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </Field>
          )}

          <Field orientation="horizontal">
            <Button type="submit" disabled={accept.isPending}>
              {t("common.submit")}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
