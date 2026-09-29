import ErrorPage from "@/components/errors/error-page";
import { FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
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
import useRequireAuth from "@/hooks/use-require-auth";
import { MUTATION, OfflineError, isOfflineError } from "@/lib/mutations";
import { trpc, type ApiError } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_LIST_MEMBERS,
  Permission,
  ROLE_NAMES,
  Role,
  can,
  roleOf,
  uuidv7,
  type LeaveListInput,
  type ListDetail,
  type ListMember,
  type RemoveMemberInput,
  type RoleName,
  type SetMemberInput,
} from "@pantry/shared";
import { onlineManager, useMutation } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  LogOutIcon,
  TriangleAlertIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import * as z from "zod";
import { roleDescriptionKeys, roleLabelKeys } from "./role-labels";
import { useListDetail } from "./use-lists";

const listsPath = "/lists";

/** Not a role: a mask that matches none of them, set outside this screen. */
const CUSTOM = "custom";
type RoleChoice = RoleName | typeof CUSTOM;

/**
 * Who is on a list, and — for its managers — who may do what.
 *
 * Every write here is online-only (see `QUEUEABLE`), so the controls are
 * disabled offline rather than left to fail: adding someone needs the lookup,
 * and the lookup needs the server.
 *
 * The creator's own row is not editable from here. The server only insists on
 * "at least one manager", but a list whose creator was demoted by somebody
 * they shared it with is a surprise nobody asked for.
 */
export default function ListMembersPage() {
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

  return <Members list={detail.data} />;
}

function Members({ list }: { list: ListDetail }) {
  const { t } = useTranslation();
  const me = useRequireAuth();
  const online = useIsOnline();

  const canManage = can(list.permissions, Permission.Manage);
  const isCreator = list.createdBy === me.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.lists.members.title", { name: list.name })}
        </h1>
        <p className="text-muted-foreground text-xs">
          {t(
            canManage
              ? "feature.lists.members.manageDescription"
              : "feature.lists.members.readDescription",
          )}
        </p>
      </div>

      {!online && (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>{t("feature.sync.offline")}</AlertTitle>
          <AlertDescription>
            {t("feature.lists.members.offline")}
          </AlertDescription>
        </Alert>
      )}

      {canManage && <AddMemberForm list={list} disabled={!online} />}

      <ItemGroup className="max-w-2xl gap-2">
        {list.members.map((member) => (
          <MemberRow
            key={member.user.id}
            list={list}
            member={member}
            editable={
              canManage &&
              member.user.id !== me.id &&
              member.user.id !== list.createdBy
            }
            disabled={!online}
          />
        ))}
      </ItemGroup>

      <FieldSeparator className="max-w-2xl" />

      {isCreator ? (
        <p className="text-muted-foreground max-w-2xl text-xs">
          {t("feature.lists.members.creatorCannotLeave")}
        </p>
      ) : (
        <div>
          <LeaveListAction list={list} disabled={!online} />
        </div>
      )}
    </div>
  );
}

function useRoleItems() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      ...Object.fromEntries(
        ROLE_NAMES.map((name) => [name, t(roleLabelKeys[name])]),
      ),
      [CUSTOM]: t("feature.lists.role.custom"),
    }),
    [t],
  );
}

function AddMemberForm({
  list,
  disabled,
}: {
  list: ListDetail;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const roleItems = useRoleItems();
  const [error, setError] = useState<string | null>(null);

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
          form.reset({ email: "", role: data.role });
          toast.add({
            description: t("feature.lists.members.added", {
              displayName: found.displayName,
            }),
          });
        },
      },
    );
  };

  return (
    <form
      className="max-w-2xl"
      onSubmit={(e) => void form.handleSubmit(onValid)(e)}
    >
      <FieldSet>
        <FieldLegend>{t("feature.lists.members.addTitle")}</FieldLegend>
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
                disabled={disabled || full}
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
                disabled={disabled || full}
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
          <Button type="submit" disabled={disabled || full || pending}>
            <UserPlusIcon data-icon="inline-start" />
            {t("feature.lists.members.add")}
          </Button>
        </Field>
      </FieldSet>
    </form>
  );
}

function MemberRow({
  list,
  member,
  editable,
  disabled,
}: {
  list: ListDetail;
  member: ListMember;
  editable: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const me = useRequireAuth();
  const roleItems = useRoleItems();

  const set = useAppMutation<SetMemberInput, ListMember[]>(
    MUTATION.listMemberSet,
  );

  const role = roleOf(member.permissions);
  const choice: RoleChoice = role ?? CUSTOM;

  const changeRole = (next: unknown) => {
    if (typeof next !== "string" || next === CUSTOM || next === choice) return;
    set.mutate({
      mutationId: uuidv7(),
      listId: list.id,
      userId: member.user.id,
      permissions: Role[next as RoleName],
    });
  };

  return (
    <Item variant="outline" role="listitem">
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{member.user.displayName}</span>
          {member.user.id === me.id && (
            <Badge variant="outline">{t("feature.lists.members.you")}</Badge>
          )}
          {member.user.id === list.createdBy && (
            <Badge variant="secondary">
              {t("feature.lists.members.creator")}
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription className="truncate">
          {member.user.email}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {editable ? (
          <>
            <Select
              items={roleItems}
              value={choice}
              onValueChange={changeRole}
              disabled={disabled || set.isPending}
            >
              <SelectTrigger
                size="sm"
                className="w-32"
                aria-label={t("feature.lists.members.roleOf", {
                  displayName: member.user.displayName,
                })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {t(roleLabelKeys[name])}
                  </SelectItem>
                ))}
                {choice === CUSTOM && (
                  <SelectItem value={CUSTOM} disabled>
                    {t("feature.lists.role.custom")}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <RemoveMemberAction
              list={list}
              member={member}
              disabled={disabled}
            />
          </>
        ) : (
          <Badge variant="outline">
            {role ? t(roleLabelKeys[role]) : t("feature.lists.role.custom")}
          </Badge>
        )}
      </ItemActions>
    </Item>
  );
}

function RemoveMemberAction({
  list,
  member,
  disabled,
}: {
  list: ListDetail;
  member: ListMember;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const remove = useAppMutation<RemoveMemberInput, ListMember[]>(
    MUTATION.listMemberRemove,
  );

  const confirm = () =>
    remove.mutate(
      { mutationId: uuidv7(), listId: list.id, userId: member.user.id },
      {
        onSuccess: () =>
          toast.add({
            description: t("feature.lists.members.removed", {
              displayName: member.user.displayName,
            }),
          }),
        onSettled: () => setOpen(false),
      },
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t("feature.lists.members.remove")}
            title={t("feature.lists.members.remove")}
          >
            <UserMinusIcon />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("feature.lists.members.removeTitle", {
              displayName: member.user.displayName,
              name: list.name,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("feature.lists.members.removeDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {t("feature.lists.form.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={confirm}
          >
            {t("feature.lists.members.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LeaveListAction({
  list,
  disabled,
}: {
  list: ListDetail;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const leave = useAppMutation<LeaveListInput>(MUTATION.listLeave);

  const confirm = () =>
    leave.mutate(
      { mutationId: uuidv7(), listId: list.id },
      {
        onSuccess: () => {
          toast.add({
            description: t("feature.lists.members.left", { name: list.name }),
          });
          void navigate(listsPath, { replace: true });
        },
        onSettled: () => setOpen(false),
      },
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" disabled={disabled}>
            <LogOutIcon data-icon="inline-start" />
            {t("feature.lists.members.leave")}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("feature.lists.members.leaveTitle", { name: list.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("feature.lists.members.leaveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leave.isPending}>
            {t("feature.lists.form.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={leave.isPending}
            onClick={confirm}
          >
            {t("feature.lists.members.leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
