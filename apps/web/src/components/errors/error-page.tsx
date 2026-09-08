import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTranslation } from "react-i18next";

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
        <EmptyDescription>
          <a href="/lists">{t("feature.notFound.home")}</a>
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}
