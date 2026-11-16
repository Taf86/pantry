import type { FeedbackStatus } from "@/hooks/use-feedback";
import { cn } from "@/lib/utils";
import { CheckIcon, XIcon, type LucideIcon } from "lucide-react";

const swap = "animate-in duration-200 fade-in-0";

/**
 * Button icon that briefly turns into a check (success) or an X (failure),
 * announcing the outcome to screen readers. Without `icon`, nothing is
 * shown while idle.
 */
export function FeedbackIcon({
  status,
  icon: Icon,
  successLabel,
  failureLabel,
}: {
  status: FeedbackStatus;
  icon?: LucideIcon;
  successLabel: string;
  failureLabel: string;
}) {
  return (
    <>
      {status === "success" ? (
        <CheckIcon
          key="success"
          data-icon="inline-start"
          className={cn(swap, "zoom-in-50")}
        />
      ) : status === "failure" ? (
        <XIcon
          key="failure"
          data-icon="inline-start"
          className={cn(swap, "zoom-in-50 text-destructive")}
        />
      ) : (
        Icon && (
          <Icon
            key="idle"
            data-icon="inline-start"
            className={cn(swap, "zoom-in-75")}
          />
        )
      )}
      <span className="sr-only" aria-live="polite">
        {status === "success"
          ? successLabel
          : status === "failure"
            ? failureLabel
            : ""}
      </span>
    </>
  );
}
