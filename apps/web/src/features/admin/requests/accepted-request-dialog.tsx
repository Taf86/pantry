import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inviteUrl } from "@/lib/invites";
import type { ApproveRequestResult } from "@pantry/shared";
import { useTranslation } from "react-i18next";
import InviteLinkShare from "../invite-link-share";

export default function AcceptedRequestDialog({
  approved,
  onClose,
}: {
  approved: ApproveRequestResult | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={approved !== null}
      modal={false}
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (open) return;
        if (details.reason !== "close-press") {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <DialogContent
        overlay={false}
        className="shadow-lg sm:top-auto sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0 sm:translate-y-0"
      >
        <DialogHeader>
          <DialogTitle>{t("feature.requests.accepted.title")}</DialogTitle>
          <DialogDescription>
            {t("feature.requests.accepted.description", {
              displayName: approved?.user.displayName ?? "",
              email: approved?.user.email ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        {approved && (
          <InviteLinkShare
            url={inviteUrl(approved.invite)}
            recipient={approved.user}
            warningTitle={t("feature.requests.accepted.warningTitle")}
          />
        )}

        <DialogFooter>
          <DialogClose>{t("feature.requests.accepted.close")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
