import { Badge } from "@/components/ui/badge";
import { statusLabelKeys } from "@/lib/user/user-labels";
import { cn } from "@/lib/utils";
import { type UserStatus as UserStatusValue } from "@pantry/shared";
import { useTranslation } from "react-i18next";

export default function UserStatusBadge({
  status,
}: {
  status: UserStatusValue;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={status === "suspended" ? "destructive" : "outline"}
      className={cn(status === "unactivated" && "text-muted-foreground")}
    >
      {t(statusLabelKeys[status])}
    </Badge>
  );
}
