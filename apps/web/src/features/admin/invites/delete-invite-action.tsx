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
import useErrorMessage from "@/hooks/use-error-message";
import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";
import { type InviteExtended } from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function DeleteInviteAction({
  invite,
}: {
  invite: InviteExtended;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const errorMessage = useErrorMessage();

  const remove = useMutation({
    mutationFn: () => trpc.admin.invites.delete.mutate({ inviteId: invite.id }),
    networkMode: "online",
    onSuccess: async (deleted) => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: keys.adminInvites() });
      toast.add({
        description: t("feature.invites.delete.done", {
          displayName: deleted.user.displayName,
        }),
      });
    },
    onError: (cause: unknown) => {
      setOpen(false);
      toast.add({ type: "error", description: errorMessage(cause) });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("feature.invites.action.delete")}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("feature.invites.delete.title", {
              displayName: invite.user.displayName,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("feature.invites.delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {t("feature.invites.delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t("feature.invites.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
