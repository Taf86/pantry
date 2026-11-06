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
import { MUTATION } from "@/lib/mutations";
import {
  uuidv7,
  type ListDetail,
  type ListMember,
  type RemoveMemberInput,
} from "@pantry/shared";
import { TriangleAlertIcon, UserMinusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function RemoveMemberAction({
  list,
  member,
  disabled,
}: {
  list: Pick<ListDetail, "id" | "name">;
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
