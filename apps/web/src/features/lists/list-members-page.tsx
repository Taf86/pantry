import { DataTable } from "@/components/data-table/data-table";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import ErrorPage from "@/components/errors/error-page";
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
import { Button } from "@/components/ui/button";
import { FieldSeparator } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useAppMutation } from "@/hooks/use-app-mutation";
import { useIsOnline } from "@/hooks/use-is-online";
import useRequireAuth from "@/hooks/use-require-auth";
import { MUTATION } from "@/lib/mutations";
import {
  Permission,
  can,
  uuidv7,
  type ListDetail,
  type ListMember,
  type RemoveMemberInput,
} from "@pantry/shared";
import {
  AlertCircleIcon,
  LogOutIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import useListMembersTable from "./use-list-members-table";
import { useListDetail } from "./use-lists";

const listsPath = "/lists";

/**
 * Who is on a list, and — for its managers — who may do what.
 *
 * Every write here is online-only (see `QUEUEABLE`), so the controls are
 * disabled offline rather than left to fail.
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
  const online = useIsOnline();

  const canManage = can(list.permissions, Permission.Manage);
  const { table, data, desktopColumns, mobileColumns, sortFields } =
    useListMembersTable(list, !online);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="ms-auto flex items-center gap-2">
          {canManage && (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link to={`/lists/${list.id}/members/add`} />}
            >
              <UserPlusIcon data-icon="inline-start" />
              {t("feature.lists.members.add")}
            </Button>
          )}
          <DataTableSort state={table} fields={sortFields} />
        </div>
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

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={data}
        state={table}
        getRowId={(member) => member.user.id}
      />

      <FieldSeparator />

      <div>
        <LeaveListAction list={list} disabled={!online} />
      </div>
    </div>
  );
}

/**
 * Leaving is removing yourself: the server lets any member do it, and refuses
 * only when it would leave the list without a manager.
 */
function LeaveListAction({
  list,
  disabled,
}: {
  list: ListDetail;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const me = useRequireAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const leave = useAppMutation<RemoveMemberInput, ListMember[]>(
    MUTATION.listMemberRemove,
  );

  const confirm = () =>
    leave.mutate(
      { mutationId: uuidv7(), listId: list.id, userId: me.id },
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
