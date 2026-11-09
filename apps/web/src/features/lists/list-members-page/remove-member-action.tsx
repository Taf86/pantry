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
import { toast } from "@/components/ui/toast";
import { useAppMutation } from "@/hooks/use-app-mutation";
import useRequireAuth from "@/hooks/use-require-auth";
import { MUTATION } from "@/lib/mutations";
import {
  uuidv7,
  type ListMembers,
  type ListMember,
  type RemoveMemberInput,
} from "@pantry/shared";
import { LogOutIcon, TriangleAlertIcon, UserMinusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function RemoveMemberAction({
  list,
  member,
  disabled,
}: {
  list: Pick<ListMembers, "listId" | "listName">;
  member: ListMember;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useRequireAuth();
  const [open, setOpen] = useState(false);
  const self = member.userId === me.id;

  const remove = useAppMutation<RemoveMemberInput, void>(
    MUTATION.listMemberRemove,
  );

  const confirm = () =>
    remove.mutate(
      { mutationId: uuidv7(), listId: list.listId, userId: member.userId },
      {
        onSuccess: () => {
          if (self) {
            void navigate("/lists", { replace: true });
            toast.add({
              description: t("feature.lists.members.left", {
                name: list.listName,
              }),
            });
            return;
          }
          toast.add({
            description: t("feature.lists.members.removed", {
              displayName: member.userDisplayName,
            }),
          });
        },
        onSettled: () => setOpen(false),
      },
    );

  const label = t(
    self ? "feature.lists.members.leave" : "feature.lists.members.remove",
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={label}
            title={label}
          >
            {self ? <LogOutIcon /> : <UserMinusIcon />}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {self
              ? t("feature.lists.members.leaveTitle", { name: list.listName })
              : t("feature.lists.members.removeTitle", {
                  displayName: member.userDisplayName,
                  name: list.listName,
                })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              self
                ? "feature.lists.members.leaveDescription"
                : "feature.lists.members.removeDescription",
            )}
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
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
