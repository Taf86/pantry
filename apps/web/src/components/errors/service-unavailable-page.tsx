import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "react-i18next";

export default function ServiceUnavailablePage() {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t("feature.serviceUnavailable.title")}</EmptyTitle>
        <EmptyDescription>
          {t("feature.serviceUnavailable.description")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
