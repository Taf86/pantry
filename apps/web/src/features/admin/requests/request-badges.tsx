import { Badge } from "@/components/ui/badge";
import { requestStatusLabelKeys, requestTypeLabelKeys } from "@/lib/requests";
import { cn } from "@/lib/utils";
import {
  RequestStatus,
  type RequestStatus as RequestStatusValue,
  type RequestType,
} from "@pantry/shared";
import { useTranslation } from "react-i18next";

export function RequestTypeBadge({ type }: { type: RequestType }) {
  const { t } = useTranslation();
  return <Badge variant="outline">{t(requestTypeLabelKeys[type])}</Badge>;
}

export function RequestStatusBadge({ status }: { status: RequestStatusValue }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={status === RequestStatus.rejected ? "destructive" : "outline"}
      className={cn(
        status === RequestStatus.approved && "text-muted-foreground",
      )}
    >
      {t(requestStatusLabelKeys[status])}
    </Badge>
  );
}
