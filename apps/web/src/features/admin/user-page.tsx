import { FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import ErrorPage from "@/components/errors/error-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
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
  UserStatus,
  UserStatuses,
  userRoleSchema,
  userStatusSchema,
} from "@pantry/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  CopyIcon,
  LinkIcon,
  MailIcon,
  Share2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import z from "zod";
import { roleLabelKeys, statusLabelKeys } from "../../lib/user/user-labels";

const usersPath = "/admin/users";

export default function UserPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { userId } = useParams<{ userId: string }>();
  const editing = userId !== undefined;

  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "CONFLICT":
        return t("feature.users.form.emailInUse");
      case "BAD_REQUEST":
        return t("feature.users.form.notAllowed");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);

  const [error, setError] = useState<string | null>(null);

  const user = useQuery({
    queryKey: keys.adminUser(userId ?? ""),
    queryFn: () => trpc.admin.users.get.query({ userId: userId ?? "" }),
    enabled: editing,
    retry: false,
    networkMode: "online",
  });

  const formSchema = z.object({
    displayName: requiredString(t).max(MAX_NAME_LENGTH),
    email: z.email(),
    role: userRoleSchema,
    status: userStatusSchema,
  });
  type Values = z.infer<typeof formSchema>;

  const loaded = useMemo<Values | undefined>(
    () =>
      user.data && {
        displayName: user.data.displayName,
        email: user.data.email,
        role: user.data.role,
        status: user.data.status,
      },
    [user.data],
  );

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: "",
      email: "",
      role: UserRole.user,
      status: UserStatus.unactivated,
    },
    ...(loaded && { values: loaded }),
  });

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
  };

  const create = useMutation({
    mutationFn: (input: Values) =>
      trpc.admin.users.create.mutate({
        displayName: input.displayName,
        email: input.email,
        role: input.role,
      }),
    networkMode: "online",
    onSuccess: refreshUsers,
    onError: (cause: unknown) => setError(errorMessage(cause)),
  });

  const edit = useMutation({
    mutationFn: (input: Values) =>
      trpc.admin.users.edit.mutate({ userId: userId ?? "", ...input }),
    networkMode: "online",
    onSuccess: async () => {
      await refreshUsers();
      toast.add({ description: t("feature.users.form.saved") });
    },
    onError: (cause: unknown) => setError(errorMessage(cause)),
  });

  const regenerateInvite = useMutation({
    mutationFn: () =>
      trpc.admin.users.regenerateInvite.mutate({ userId: userId ?? "" }),
    networkMode: "online",
    onSuccess: refreshUsers,
    onError: (cause: unknown) =>
      toast.add({ type: "error", description: errorMessage(cause) }),
  });

  const created = create.data;
  const locked = !editing && created !== undefined;
  const invite = created?.invite ?? regenerateInvite.data?.invite;
  const url = invite ? inviteUrl(invite) : "";
  const shown = user.data ?? created?.user;
  const pending = create.isPending || edit.isPending;

  const roleItems = useMemo(
    () => ({
      [UserRole.user]: t(roleLabelKeys[UserRole.user]),
      [UserRole.admin]: t(roleLabelKeys[UserRole.admin]),
    }),
    [t],
  );

  const statusItems = useMemo(
    () => ({
      [UserStatus.unactivated]: t(statusLabelKeys[UserStatus.unactivated]),
      [UserStatus.active]: t(statusLabelKeys[UserStatus.active]),
      [UserStatus.suspended]: t(statusLabelKeys[UserStatus.suspended]),
    }),
    [t],
  );

  const onValid: SubmitHandler<Values, unknown> = (data, event) => {
    event?.preventDefault();
    if (locked) return;
    setError(null);
    if (editing) {
      edit.mutate(data);
    } else {
      create.mutate(data);
    }
  };

  const copy = async () =>
    toast.add(
      (await copyToClipboard(url))
        ? { description: t("feature.users.form.copied") }
        : { type: "error", description: t("feature.users.form.copyFailed") },
    );

  const share = async () => {
    const outcome = await shareLink({
      title: t("feature.users.form.mailSubject"),
      text: t("feature.users.form.shareText", {
        displayName: shown?.displayName ?? "",
        email: shown?.email ?? "",
      }),
      url,
    });
    if (outcome === "failed") {
      toast.add({
        type: "error",
        description: t("feature.users.form.shareFailed"),
      });
    }
  };

  const mailHref = shown
    ? mailtoUrl({
        to: shown.email,
        subject: t("feature.users.form.mailSubject"),
        body: t("feature.users.form.mailBody", {
          displayName: shown.displayName,
          url,
        }),
      })
    : "";

  if (editing && user.isPending) return <Loader />;
  if (editing && user.isError) {
    return (
      <ErrorPage
        title={t("feature.users.form.notFoundTitle")}
        description={t("feature.users.form.notFound")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-medium">
        {t(
          editing
            ? "feature.users.form.editTitle"
            : "feature.users.form.createTitle",
        )}
      </h1>

      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)}>
        <FieldGroup>
          <FieldSet className="max-w-md">
            <FieldDescription>
              {t(
                editing
                  ? "feature.users.form.editDescription"
                  : "feature.users.form.createDescription",
              )}
            </FieldDescription>
            <FieldGroup>
              <FormField
                name="displayName"
                control={form.control}
                label={t("feature.users.form.name")}
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
                label={t("feature.users.form.email")}
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
                label={t("feature.users.form.role")}
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

              {editing && (
                <FormField
                  name="status"
                  control={form.control}
                  label={t("feature.users.form.status")}
                >
                  {({ field, invalid }) => (
                    <Select
                      items={statusItems}
                      value={field.value}
                      onValueChange={field.onChange}
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
                        {UserStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(statusLabelKeys[status])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
            </FieldGroup>

            {error !== null && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>
                  {t(
                    editing
                      ? "feature.users.form.editFailed"
                      : "feature.users.form.createFailed",
                  )}
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field orientation="horizontal">
              <Button type="submit" disabled={pending || locked}>
                {t(
                  editing
                    ? "feature.users.form.save"
                    : "feature.users.form.create",
                )}
              </Button>
            </Field>
          </FieldSet>

          <FieldSeparator className="max-w-md" />

          <FieldSet className="max-w-md">
            <Field>
              <FieldLabel htmlFor="inviteLink">
                {t("feature.users.form.link")}
              </FieldLabel>
              <Input
                id="inviteLink"
                readOnly
                value={url}
                placeholder={t(
                  editing
                    ? "feature.users.form.linkPendingEdit"
                    : "feature.users.form.linkPendingCreate",
                )}
                onFocus={(e) => e.currentTarget.select()}
              />
            </Field>

            {url !== "" && (
              <Alert>
                <TriangleAlertIcon />
                <AlertTitle>
                  {t(
                    editing
                      ? "feature.users.form.linkWarningTitleEdit"
                      : "feature.users.form.linkWarningTitleCreate",
                  )}
                </AlertTitle>
                <AlertDescription>
                  {t("feature.users.form.linkWarning")}
                </AlertDescription>
              </Alert>
            )}

            <Field orientation="horizontal" className="flex-wrap">
              {/* Only editing offers this: creating issues the first link. */}
              {editing && (
                <Button
                  type="button"
                  disabled={regenerateInvite.isPending}
                  onClick={() => regenerateInvite.mutate()}
                >
                  <LinkIcon data-icon="inline-start" />
                  {t("feature.users.form.generate")}
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                disabled={url === ""}
                onClick={() => void copy()}
              >
                <CopyIcon data-icon="inline-start" />
                {t("feature.users.form.copy")}
              </Button>

              {canShare() ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={url === ""}
                  onClick={() => void share()}
                >
                  <Share2Icon data-icon="inline-start" />
                  {t("feature.users.form.share")}
                </Button>
              ) : url === "" ? (
                // A disabled anchor still navigates, so render a plain button.
                <Button type="button" variant="outline" disabled>
                  <MailIcon data-icon="inline-start" />
                  {t("feature.users.form.sendEmail")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={mailHref} />}
                >
                  <MailIcon data-icon="inline-start" />
                  {t("feature.users.form.sendEmail")}
                </Button>
              )}
            </Field>
          </FieldSet>

          <Field orientation="horizontal">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void navigate(usersPath)}
            >
              {t(
                editing || locked
                  ? "feature.users.form.close"
                  : "feature.users.form.cancel",
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
