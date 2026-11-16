import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { canShare, mailtoUrl, shareLink } from "@/lib/share";
import type { UserRef } from "@pantry/shared";
import {
  CheckIcon,
  CopyIcon,
  MailIcon,
  Share2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

type InviteLinkShareProps = {
  url: string;
  recipient?: Pick<UserRef, "displayName" | "email"> | undefined;
  placeholder?: string;
  warningTitle?: string;
  className?: string;
  children?: React.ReactNode;
};

export default function InviteLinkShare({
  url,
  recipient,
  placeholder,
  warningTitle,
  className,
  children,
}: InviteLinkShareProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const displayName = recipient?.displayName ?? "";
  const email = recipient?.email ?? "";

  const clipboard = useCopyToClipboard();

  const copyFeedback = {
    copied: t("feature.inviteLink.copied"),
    failed: t("feature.inviteLink.copyFailed"),
    idle: "",
  }[clipboard.status];

  const share = async () => {
    const outcome = await shareLink({
      title: t("feature.inviteLink.mailSubject"),
      text: t("feature.inviteLink.shareText", { displayName, email }),
      url,
    });
    if (outcome === "failed") {
      toast.add({
        type: "error",
        description: t("feature.inviteLink.shareFailed"),
      });
    }
  };

  const mailHref = recipient
    ? mailtoUrl({
        to: email,
        subject: t("feature.inviteLink.mailSubject"),
        body: t("feature.inviteLink.mailBody", { displayName, url }),
      })
    : "";

  return (
    <FieldSet className={className}>
      <Field>
        <FieldLabel htmlFor={inputId}>
          {t("feature.inviteLink.label")}
        </FieldLabel>
        <Input
          id={inputId}
          readOnly
          value={url}
          placeholder={placeholder}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Field>

      {url !== "" && warningTitle !== undefined && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{warningTitle}</AlertTitle>
          <AlertDescription>{t("feature.inviteLink.warning")}</AlertDescription>
        </Alert>
      )}

      <Field orientation="horizontal" className="flex-wrap">
        {children}

        <Button
          type="button"
          variant="outline"
          disabled={url === ""}
          onClick={() => void clipboard.copy(url)}
        >
          {clipboard.status === "copied" ? (
            <CheckIcon
              key="copied"
              data-icon="inline-start"
              className="animate-in duration-200 fade-in-0 zoom-in-50"
            />
          ) : clipboard.status === "failed" ? (
            <XIcon
              key="failed"
              data-icon="inline-start"
              className="text-destructive animate-in duration-200 fade-in-0 zoom-in-50"
            />
          ) : (
            <CopyIcon
              key="copy"
              data-icon="inline-start"
              className="animate-in duration-200 fade-in-0 zoom-in-75"
            />
          )}
          {t("feature.inviteLink.copy")}
          <span className="sr-only" aria-live="polite">
            {copyFeedback}
          </span>
        </Button>

        {canShare() ? (
          <Button
            type="button"
            variant="outline"
            disabled={url === ""}
            onClick={() => void share()}
          >
            <Share2Icon data-icon="inline-start" />
            {t("feature.inviteLink.share")}
          </Button>
        ) : url === "" || mailHref === "" ? (
          <Button type="button" variant="outline" disabled>
            <MailIcon data-icon="inline-start" />
            {t("feature.inviteLink.sendEmail")}
          </Button>
        ) : (
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={mailHref} />}
          >
            <MailIcon data-icon="inline-start" />
            {t("feature.inviteLink.sendEmail")}
          </Button>
        )}
      </Field>
    </FieldSet>
  );
}
