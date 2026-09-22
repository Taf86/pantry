import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import usePushNotifications from "@/hooks/use-push-notifications";
import { BellIcon, BellOffIcon, BellRingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PushToggle() {
  const { t } = useTranslation();
  const {
    support,
    permission,
    enabled,
    isPending,
    unavailable,
    failed,
    enable,
    disable,
  } = usePushNotifications();

  if (support === "unsupported") return null;

  if (support === "install-first") {
    return (
      <Alert>
        <BellIcon />
        <AlertTitle>{t("feature.push.title")}</AlertTitle>
        <AlertDescription>{t("feature.push.installFirst")}</AlertDescription>
      </Alert>
    );
  }

  if (unavailable) {
    return (
      <Alert>
        <BellOffIcon />
        <AlertTitle>{t("feature.push.title")}</AlertTitle>
        <AlertDescription>{t("feature.push.unavailable")}</AlertDescription>
      </Alert>
    );
  }

  if (permission === "denied") {
    return (
      <Alert>
        <BellOffIcon />
        <AlertTitle>{t("feature.push.title")}</AlertTitle>
        <AlertDescription>{t("feature.push.denied")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      {enabled ? <BellRingIcon /> : <BellIcon />}
      <AlertTitle>{t("feature.push.title")}</AlertTitle>
      <AlertDescription>
        {failed
          ? t("feature.push.error")
          : t(enabled ? "feature.push.on" : "feature.push.off")}
      </AlertDescription>
      <AlertAction>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => void (enabled ? disable() : enable())}
        >
          {t(enabled ? "feature.push.disable" : "feature.push.enable")}
        </Button>
      </AlertAction>
    </Alert>
  );
}
