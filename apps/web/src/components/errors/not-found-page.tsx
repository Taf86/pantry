import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t("feature.notFound.title")}</EmptyTitle>
        <EmptyDescription>{t("feature.notFound.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="link"
          nativeButton={false}
          render={<Link to="/lists" />}
        >
          {t("feature.notFound.home")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
