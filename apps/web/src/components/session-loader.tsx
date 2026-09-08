import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "react-i18next";

export default function SessionLoader() {
  const { t } = useTranslation();
  return (
    <Empty className="w-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner />
        </EmptyMedia>
        <EmptyTitle>{t("feature.sessionLoader.title")}</EmptyTitle>
        <EmptyDescription>
          {t("feature.sessionLoader.description")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
