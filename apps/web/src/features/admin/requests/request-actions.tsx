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
import type { ApproveRequestResult, RequestExtended } from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function RequestActions({
  request,
  onApproved,
}: {
  request: RequestExtended;
  onApproved: (approved: ApproveRequestResult) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "CONFLICT":
        return t("feature.requests.error.decided");
      case "NOT_FOUND":
        return t("feature.requests.error.noAccount");
      case "FORBIDDEN":
        return t("feature.requests.error.suspended");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.adminRequests() });
    await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
    await queryClient.invalidateQueries({ queryKey: keys.adminInvites() });
  };

  const onError = (cause: unknown) =>
    toast.add({ type: "error", description: errorMessage(cause) });

  const approve = useMutation({
    mutationFn: () =>
      trpc.admin.requests.approve.mutate({ requestId: request.id }),
    networkMode: "online",
    onSuccess: async (approved) => {
      onApproved(approved);
      await refresh();
    },
    onError,
  });

  const reject = useMutation({
    mutationFn: () =>
      trpc.admin.requests.reject.mutate({ requestId: request.id }),
    networkMode: "online",
    onSuccess: async () => {
      setConfirming(false);
      await refresh();
      toast.add({
        description: t("feature.requests.reject.done", {
          email: request.email,
        }),
      });
    },
    onError: (cause: unknown) => {
      setConfirming(false);
      onError(cause);
    },
  });

  const pending = approve.isPending || reject.isPending;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        aria-label={t("feature.requests.action.accept")}
        onClick={() => approve.mutate()}
      >
        <CheckIcon />
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={pending}
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
