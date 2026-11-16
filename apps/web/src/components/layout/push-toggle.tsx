import { toast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import usePushNotifications, {
  type PushOutcome,
} from "@/hooks/use-push-notifications";
import { BellIcon, BellRingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";

// enabled/disabled are visible from the toggle itself: only explain failures.
const FAILURES: Record<
  Exclude<PushOutcome, "enabled" | "disabled">,
  { key: ParseKeys; type: "info" | "warning" | "error" }
> = {
  unavailable: { key: "feature.push.unavailable", type: "warning" },
  denied: { key: "feature.push.denied", type: "warning" },
  "install-first": { key: "feature.push.installFirst", type: "info" },
  unsupported: { key: "feature.push.unsupported", type: "warning" },
  error: { key: "feature.push.error", type: "error" },
};

export default function PushToggle() {
  const { t } = useTranslation();
  const { support, enabled, isPending, toggle } = usePushNotifications();

  if (support === "unsupported") return null;

  const press = async () => {
    const outcome = await toggle();
    if (outcome === "enabled" || outcome === "disabled") return;
    const { key, type } = FAILURES[outcome];
    toast.add({ title: t("feature.push.label"), description: t(key), type });
  };

  const unknown = enabled === null;

  return (
    <Toggle
      className="px-2 sm:px-3"
      pressed={enabled === true}
      disabled={unknown || isPending}
      aria-busy={unknown}
      onPressedChange={() => void press()}
    >
      {enabled === true ? (
        <BellRingIcon data-icon="inline-start" />
      ) : (
        <BellIcon data-icon="inline-start" />
      )}
      <span className="sr-only sm:not-sr-only">{t("feature.push.label")}</span>
    </Toggle>
  );
}
