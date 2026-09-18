import { Button } from "@/components/ui/button";
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
        {/* Full reload on purpose: the app crashed, client-side navigation
            would keep whatever broken state caused it. */}
        <Button
          variant="link"
          nativeButton={false}
          render={<a href="/lists" />}
        >
          {t("feature.notFound.home")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
