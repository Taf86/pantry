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

export default function ErrorPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
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
