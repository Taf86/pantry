import ErrorPage from "@/components/errors/error-page";
import Loader from "@/components/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import useRequireAuth from "@/hooks/use-require-auth";
import { Permission, can, roleOf, type ListSummary } from "@pantry/shared";
import { ListIcon, PencilIcon, PlusIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { roleLabelKeys } from "./role-labels";
import { useLists } from "./use-lists";

export default function ListsPage() {
  const { t } = useTranslation();
  const lists = useLists();

  if (lists.isPending) return <Loader />;
  if (lists.isError) {
    return (
      <ErrorPage
        title={t("feature.lists.index.loadFailedTitle")}
        description={t("feature.lists.index.loadFailed")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-medium">
          {t("feature.lists.index.title")}
        </h1>
        <Button nativeButton={false} render={<Link to="/lists/new" />}>
          <PlusIcon data-icon="inline-start" />
          {t("feature.lists.action.create")}
        </Button>
      </div>

      {lists.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListIcon />
            </EmptyMedia>
            <EmptyTitle>{t("feature.lists.index.emptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("feature.lists.index.empty")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/lists/new" />}
            >
              <PlusIcon data-icon="inline-start" />
              {t("feature.lists.action.create")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {lists.data.map((list) => (
            <ListRow key={list.id} list={list} />
          ))}
        </ItemGroup>
      )}
    </div>
  );
}

function ListRow({ list }: { list: ListSummary }) {
  const { t } = useTranslation();
  const me = useRequireAuth();

  const canWrite = can(list.permissions, Permission.Write);
  const canManage = can(list.permissions, Permission.Manage);
  const role = roleOf(list.permissions);
  const mine = list.createdBy === me.id;

  return (
    <Item variant="outline" role="listitem">
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{list.name}</span>
          {role && <Badge variant="secondary">{t(roleLabelKeys[role])}</Badge>}
        </ItemTitle>
        <ItemDescription>
          {mine
            ? t("feature.lists.index.createdByYou")
            : list.creatorName
              ? t("feature.lists.index.createdBy", { name: list.creatorName })
              : t("feature.lists.index.createdByUnknown")}
          {" · "}
          {t("feature.lists.index.members", { count: list.memberCount })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {canWrite && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("feature.lists.action.edit")}
            title={t("feature.lists.action.edit")}
            nativeButton={false}
            render={<Link to={`/lists/${list.id}/edit`} />}
          >
            <PencilIcon />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t(
            canManage
              ? "feature.lists.action.manageMembers"
              : "feature.lists.action.members",
          )}
          title={t(
            canManage
              ? "feature.lists.action.manageMembers"
              : "feature.lists.action.members",
          )}
          nativeButton={false}
          render={<Link to={`/lists/${list.id}/members`} />}
        >
          <UsersIcon />
        </Button>
      </ItemActions>
    </Item>
  );
}
