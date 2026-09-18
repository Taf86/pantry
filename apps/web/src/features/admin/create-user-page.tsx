import { FormField } from "@/components/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import useErrorMessage from "@/hooks/use-error-message";
import { inviteUrl } from "@/lib/invites";
import { keys } from "@/lib/keys";
import { canShare, copyToClipboard, mailtoUrl, shareLink } from "@/lib/share";
import { trpc, type ApiError } from "@/lib/trpc";
import { requiredString } from "@/lib/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_NAME_LENGTH,
  UserRole,
  UserRoles,
  userRoleSchema,
} from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  CopyIcon,
  MailIcon,
  Share2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { roleLabelKeys } from "../../lib/user/user-labels";

const usersPath = "/admin/users";

export default function CreateUserPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const apiErrorMessage = (apiError: ApiError) =>
    apiError.data?.code === "CONFLICT"
      ? t("feature.users.create.emailInUse")
      : null;
  const errorMessage = useErrorMessage(apiErrorMessage);

  const [error, setError] = useState<string | null>(null);

  const formSchema = z.object({
    displayName: requiredString(t).max(MAX_NAME_LENGTH),
    email: z.email(),
    role: userRoleSchema,
  });
  type Values = z.infer<typeof formSchema>;

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: "", email: "", role: UserRole.user },
  });

  const create = useMutation({
    mutationFn: (input: Values) => trpc.admin.users.create.mutate(input),
    networkMode: "online",
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.adminUsers() }),
    onError: (cause: unknown) => setError(errorMessage(cause)),
  });

  // The mutation already owns the "created" state, consistent with isPending.
  const created = create.data;
  const locked = created !== undefined;
  const url = created ? inviteUrl(created.invite) : "";

  // With `items` set the closed trigger shows the label, not the raw value.
  const roleItems = useMemo(
    () => ({
      [UserRole.user]: t(roleLabelKeys[UserRole.user]),
      [UserRole.admin]: t(roleLabelKeys[UserRole.admin]),
    }),
    [t],
  );

  const onValid: SubmitHandler<Values, unknown> = (data, event) => {
    event?.preventDefault();
    if (locked) return;
    setError(null);
    create.mutate(data);
  };

  const copy = async () =>
    toast.add(
      (await copyToClipboard(url))
        ? { description: t("feature.users.create.copied") }
        : { type: "error", description: t("feature.users.create.copyFailed") },
    );

  const share = async () => {
    // Nothing may be awaited before this call: it would spend the user gesture.
    const outcome = await shareLink({
      title: t("feature.users.create.mailSubject"),
      text: t("feature.users.create.shareText", {
        displayName: created?.user.displayName ?? "",
      }),
      url,
    });
    if (outcome === "failed") {
      toast.add({
        type: "error",
        description: t("feature.users.create.shareFailed"),
      });
    }
  };

  const mailHref = created
    ? mailtoUrl({
        to: created.user.email,
        subject: t("feature.users.create.mailSubject"),
        body: t("feature.users.create.mailBody", {
          displayName: created.user.displayName,
          url,
        }),
      })
    : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-medium">
        {t("feature.users.create.title")}
      </h1>

      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet className="max-w-md">
            <FieldDescription>
              {t("feature.users.create.description")}
            </FieldDescription>
            <FieldGroup>
              <FormField
                name="displayName"
                control={form.control}
                label={t("feature.users.create.name")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    autoComplete="off"
                    disabled={locked}
                  />
                )}
              </FormField>

              <FormField
                name="email"
                control={form.control}
                label={t("feature.users.create.email")}
              >
                {({ field, invalid }) => (
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={invalid}
                    type="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={locked}
                  />
                )}
              </FormField>

              <FormField
                name="role"
                control={form.control}
                label={t("feature.users.create.role")}
              >
                {({ field, invalid }) => (
                  <Select
                    items={roleItems}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={locked}
                  >
                    <SelectTrigger
                      id={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      aria-invalid={invalid}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UserRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(roleLabelKeys[role])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>

              <Field>
                <FieldLabel htmlFor="inviteLink">
                  {t("feature.users.create.link")}
                </FieldLabel>
                <Input
                  id="inviteLink"
                  readOnly
                  value={url}
                  placeholder={t("feature.users.create.linkPending")}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          {locked && (
            <Field orientation="horizontal">
              <Alert className="max-w-md">
                <TriangleAlertIcon />
                <AlertTitle>
                  {t("feature.users.create.linkWarningTitle")}
                </AlertTitle>
                <AlertDescription>
                  {t("feature.users.create.linkWarning")}
                </AlertDescription>
              </Alert>
            </Field>
          )}

          {error !== null && (
            <Field orientation="horizontal">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircleIcon />
                <AlertTitle>{t("feature.users.create.failed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </Field>
          )}

          {locked ? (
            <Field orientation="horizontal" className="flex-wrap">
              <Button type="button" onClick={() => void copy()}>
                <CopyIcon data-icon="inline-start" />
                {t("feature.users.create.copy")}
              </Button>

              {canShare() ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void share()}
                >
                  <Share2Icon data-icon="inline-start" />
                  {t("feature.users.create.share")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={mailHref} />}
                >
                  <MailIcon data-icon="inline-start" />
                  {t("feature.users.create.sendEmail")}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={() => void navigate(usersPath)}
              >
                {t("feature.users.create.close")}
              </Button>
            </Field>
          ) : (
            <Field orientation="horizontal" className="flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate(usersPath)}
              >
                {t("feature.users.create.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {t("common.submit")}
              </Button>
            </Field>
          )}
        </FieldGroup>
      </form>
    </div>
  );
}
