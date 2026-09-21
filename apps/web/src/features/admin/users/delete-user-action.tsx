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
import { trpc, type ApiError } from "@/lib/trpc";
import { type UserExtended } from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function DeleteUserAction({ user }: { user: UserExtended }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const apiErrorMessage = (apiError: ApiError) =>
    apiError.data?.code === "BAD_REQUEST"
      ? t("feature.users.delete.notAllowed")
      : null;
  const errorMessage = useErrorMessage(apiErrorMessage);

  const remove = useMutation({
    mutationFn: () => trpc.admin.users.delete.mutate({ userId: user.id }),
    networkMode: "online",
    onSuccess: async (deleted) => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
      toast.add({
        description: t("feature.users.delete.done", {
          displayName: deleted.displayName,
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
            aria-label={t("feature.users.action.delete")}
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
            {t("feature.users.delete.title", {
              displayName: user.displayName,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("feature.users.delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {t("feature.users.delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t("feature.users.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
