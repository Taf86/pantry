import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "react-i18next";

export default function UnknownErrorPage() {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t("feature.unknownError.title")}</EmptyTitle>
        <EmptyDescription>
          {t("feature.unknownError.description")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <EmptyDescription>
          <a href="/lists">{t("feature.notFound.home")}</a>
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}
