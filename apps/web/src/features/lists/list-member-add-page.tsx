import ErrorPage from "@/components/errors/error-page";
import { FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
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
import { useAppMutation } from "@/hooks/use-app-mutation";
import useErrorMessage from "@/hooks/use-error-message";
import { useIsOnline } from "@/hooks/use-is-online";
import { MUTATION, OfflineError, isOfflineError } from "@/lib/mutations";
import { trpc, type ApiError } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_LIST_MEMBERS,
  Permission,
  ROLE_NAMES,
  Role,
  can,
  uuidv7,
  type ListDetail,
  type ListMember,
  type SetMemberInput,
} from "@pantry/shared";
import { onlineManager, useMutation } from "@tanstack/react-query";
import { AlertCircleIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import * as z from "zod";
import { roleDescriptionKeys, roleLabelKeys } from "./role-labels";
import { useListDetail } from "./use-lists";
import useRoleItems from "./use-role-items";

/**
 * Adds somebody to a list, by the exact email of their account.
 *
 * Online-only, like every membership write: the user id it needs comes from a
 * lookup, and the lookup needs the server.
 */
export default function ListMemberAddPage() {
  const { t } = useTranslation();
  const { listId = "" } = useParams<{ listId: string }>();
  const detail = useListDetail(listId);

  if (detail.isPending) return <Loader />;
  if (detail.isError) {
    return (
      <ErrorPage
        title={t("feature.lists.form.notFoundTitle")}
        description={t("feature.lists.form.notFound")}
      />
    );
  }
  if (!can(detail.data.permissions, Permission.Manage)) {
    return (
      <ErrorPage
        title={t("feature.lists.form.forbiddenTitle")}
        description={t("feature.lists.members.forbidden")}
      />
    );
  }

  return <AddMember list={detail.data} />;
}

function AddMember({ list }: { list: ListDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const online = useIsOnline();
  const roleItems = useRoleItems();
  const [error, setError] = useState<string | null>(null);

  const membersPath = `/lists/${list.id}/members`;

  const apiErrorMessage = (apiError: ApiError) =>
    apiError.data?.code === "TOO_MANY_REQUESTS"
      ? t("feature.lists.members.tooManyLookups")
      : null;
  const errorMessage = useErrorMessage(apiErrorMessage);

  const formSchema = z.object({
    email: z.email(),
    role: z.enum(ROLE_NAMES),
  });
  type Values = z.infer<typeof formSchema>;

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", role: "Editor" },
  });

  // A query in spirit, but fired on submit: a mutation is the honest shape for
  // "ask once, now", and `always` keeps it from pausing offline.
  const lookup = useMutation({
    mutationFn: (email: string) => {
      if (!onlineManager.isOnline()) throw new OfflineError();
      return trpc.lists.members.find.query({ listId: list.id, email });
    },
    networkMode: "always",
    retry: false,
  });

  const set = useAppMutation<SetMemberInput, ListMember[]>(
    MUTATION.listMemberSet,
  );

  const full = list.members.length >= MAX_LIST_MEMBERS;
  const disabled = !online || full;
  const pending = lookup.isPending || set.isPending;
  const role = useWatch({ control: form.control, name: "role" });

  const onValid: SubmitHandler<Values, unknown> = async (data, event) => {
    event?.preventDefault();
    setError(null);

    let found;
    try {
      found = await lookup.mutateAsync(data.email);
    } catch (cause) {
      setError(
        isOfflineError(cause)
          ? t("feature.sync.needsNetwork")
          : errorMessage(cause),
      );
      return;
    }

    if (!found) {
      setError(t("feature.lists.members.userNotFound"));
      return;
    }
    if (list.members.some((member) => member.user.id === found.id)) {
      setError(t("feature.lists.members.alreadyMember"));
      return;
    }

    set.mutate(
      {
        mutationId: uuidv7(),
        listId: list.id,
        userId: found.id,
        permissions: Role[data.role],
      },
      {
        onSuccess: () => {
          toast.add({
            description: t("feature.lists.members.added", {
              displayName: found.displayName,
            }),
          });
          void navigate(membersPath);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-medium">
        {t("feature.lists.members.addTitle")}
      </h1>

      {!online && (
        <Alert className="max-w-2xl">
          <AlertCircleIcon />
          <AlertTitle>{t("feature.sync.offline")}</AlertTitle>
          <AlertDescription>
            {t("feature.lists.members.offline")}
          </AlertDescription>
        </Alert>
      )}

      <form
        className="max-w-2xl"
        onSubmit={(e) => void form.handleSubmit(onValid)(e)}
      >
        <FieldSet>
          <FieldDescription>
            {full
              ? t("feature.lists.members.full", { max: MAX_LIST_MEMBERS })
              : t("feature.lists.members.addDescription")}
          </FieldDescription>
          <FieldGroup className="sm:flex-row sm:items-start">
            <FormField
              name="email"
              control={form.control}
              label={t("feature.lists.members.email")}
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
                  autoFocus
                  disabled={disabled}
                />
              )}
            </FormField>

            <FormField
              name="role"
              control={form.control}
              label={t("feature.lists.members.role")}
            >
              {({ field, invalid }) => (
                <Select
                  items={roleItems}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
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
                    {ROLE_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {t(roleLabelKeys[name])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FieldGroup>
          <FieldDescription>{t(roleDescriptionKeys[role])}</FieldDescription>

          {error !== null && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t("feature.lists.members.addFailed")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Field orientation="horizontal">
            <Button type="submit" disabled={disabled || pending}>
              <UserPlusIcon data-icon="inline-start" />
              {t("feature.lists.members.add")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void navigate(membersPath)}
            >
              {t("feature.lists.form.cancel")}
            </Button>
          </Field>
        </FieldSet>
      </form>
    </div>
  );
}
