import { formReturnState } from "@/hooks/use-leave-form";
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
import type { RequestExtended } from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function RequestActions({
  request,
}: {
  request: RequestExtended;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "CONFLICT":
        return t("feature.requests.error.decided");
      case "BAD_REQUEST":
        return t("feature.requests.error.tenant");
      case "NOT_FOUND":
        return t("feature.requests.error.noAccount");
      case "FORBIDDEN":
        return t("feature.requests.error.suspended");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);

  const reject = useMutation({
    mutationFn: () =>
      trpc.admin.requests.reject.mutate({ requestId: request.id }),
    networkMode: "online",
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: keys.adminRequests() });
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
      await queryClient.invalidateQueries({ queryKey: keys.adminInvites() });
    },
    onError: (cause: unknown) => {
      setConfirming(false);
      toast.add({ type: "error", description: errorMessage(cause) });
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={reject.isPending}
        aria-label={t("feature.requests.action.accept")}
        nativeButton={false}
        render={
          <Link to={`/admin/requests/${request.id}`} state={formReturnState} />
        }
      >
        <CheckIcon />
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={reject.isPending}
              aria-label={t("feature.requests.action.reject")}
            >
              <XIcon />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlertIcon className="text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("feature.requests.reject.title", { email: request.email })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("feature.requests.reject.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reject.isPending}>
              {t("feature.requests.reject.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => reject.mutate()}
            >
              {t("feature.requests.reject.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
