import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FeedbackIcon } from "@/components/feedback-icon";
import { useFeedback } from "@/hooks/use-feedback";
import { canShare, copyToClipboard, mailtoUrl, shareLink } from "@/lib/share";
import type { UserRef } from "@pantry/shared";
import {
  CopyIcon,
  MailIcon,
  Share2Icon,
  TriangleAlertIcon,
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

  const copyFeedback = useFeedback();
  const shareFeedback = useFeedback();

  const copy = async () =>
    copyFeedback.show((await copyToClipboard(url)) ? "success" : "failure");

  const share = async () => {
    const outcome = await shareLink({
      title: t("feature.inviteLink.mailSubject"),
      text: t("feature.inviteLink.shareText", { displayName, email }),
      url,
    });
    if (outcome === "failed") shareFeedback.show("failure");
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
          onClick={() => void copy()}
        >
          <FeedbackIcon
            status={copyFeedback.status}
            icon={CopyIcon}
            successLabel={t("feature.inviteLink.copied")}
            failureLabel={t("feature.inviteLink.copyFailed")}
          />
          {t("feature.inviteLink.copy")}
        </Button>

        {canShare() ? (
          <Button
            type="button"
            variant="outline"
            disabled={url === ""}
            onClick={() => void share()}
          >
            <FeedbackIcon
              status={shareFeedback.status}
              icon={Share2Icon}
              successLabel=""
              failureLabel={t("feature.inviteLink.shareFailed")}
            />
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
