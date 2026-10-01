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
import { uuidv7, type DeleteListInput, type ListSummary } from "@pantry/shared";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function DeleteListAction({ list }: { list: ListSummary }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const remove = useAppMutation<DeleteListInput>(MUTATION.listDelete);

  const confirm = () => {
    remove.mutate(
      { mutationId: uuidv7(), listId: list.id },
      {
        onSuccess: () =>
          toast.add({
            description: t("feature.lists.index.deleted", { name: list.name }),
          }),
      },
    );
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("feature.lists.action.delete")}
            title={t("feature.lists.action.delete")}
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
            {t("feature.lists.index.deleteTitle", { name: list.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("feature.lists.index.deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("feature.lists.form.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>
            {t("feature.lists.action.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
