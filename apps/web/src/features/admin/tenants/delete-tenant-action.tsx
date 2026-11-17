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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import useErrorMessage from "@/hooks/use-error-message";
import { keys } from "@/lib/keys";
import { trpc, type ApiError } from "@/lib/trpc";
import type { TenantSummary } from "@pantry/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function DeleteTenantAction({
  tenant,
}: {
  tenant: TenantSummary;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const blockedReason = tenant.main
    ? t("feature.tenants.delete.mainBlocked")
    : tenant.own
      ? t("feature.tenants.delete.ownBlocked")
      : null;
  // Deleting users cannot be undone: ask for the name when there are any.
  const needsName = tenant.userCount > 0;
  const confirmed = !needsName || typed.trim() === tenant.name;

  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "BAD_REQUEST":
        return t("feature.tenants.delete.notAllowed");
      case "NOT_FOUND":
        return t("feature.tenants.notFound");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);

  const remove = useMutation({
    mutationFn: () => trpc.admin.tenants.delete.mutate({ tenantId: tenant.id }),
    networkMode: "online",
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: keys.adminTenants() });
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
      await queryClient.invalidateQueries({ queryKey: keys.adminInvites() });
    },
    onError: (cause: unknown) => {
      setOpen(false);
      toast.add({ type: "error", description: errorMessage(cause) });
    },
  });

  const onOpenChange = (next: boolean) => {
    if (next) setTyped("");
    setOpen(next);
  };

  const label = blockedReason ?? t("feature.tenants.action.delete");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={blockedReason !== null}
            aria-label={label}
            title={label}
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
            {t("feature.tenants.delete.title", { name: tenant.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {needsName
              ? t("feature.tenants.delete.descriptionWithUsers", {
                  count: tenant.userCount,
                })
              : t("feature.tenants.delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsName && (
          <Field>
            <FieldLabel htmlFor={`delete-tenant-${tenant.id}`}>
              {t("feature.tenants.delete.typeName", { name: tenant.name })}
            </FieldLabel>
            <Input
              id={`delete-tenant-${tenant.id}`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={remove.isPending}
            />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {t("feature.tenants.delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending || !confirmed}
            onClick={() => remove.mutate()}
          >
            {t("feature.tenants.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
