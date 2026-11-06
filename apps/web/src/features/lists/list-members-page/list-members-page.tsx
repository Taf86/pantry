import { DataTable } from "@/components/data-table/data-table";
import { DataTableSort } from "@/components/data-table/data-table-sort";
import ErrorPage from "@/components/errors/error-page";
import Loader from "@/components/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useIsOnline } from "@/hooks/use-is-online";
import useRequireAuth from "@/hooks/use-require-auth";
import { Permission, can, type ListMembers } from "@pantry/shared";
import { AlertCircleIcon, UserPlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import useListMembersTable from "./use-list-members-table";
import { useListMembers } from "../common/use-lists";

export default function ListMembersPage() {
  const { t } = useTranslation();
  const { listId = "" } = useParams<{ listId: string }>();
  const detail = useListMembers(listId);

  if (detail.isPending) return <Loader />;
  if (detail.isError) {
    return (
      <ErrorPage
        title={t("feature.lists.form.notFoundTitle")}
        description={t("feature.lists.form.notFound")}
      />
    );
  }
  if (!detail.data) return <Loader />;

  return <Members listMembers={detail.data} />;
}

function Members({ listMembers }: { listMembers: ListMembers }) {
  const { t } = useTranslation();
  const online = useIsOnline();
  const me = useRequireAuth();

  const canManage = can(
    listMembers?.members?.find((m) => m.userId === me.id)?.permissions,
    Permission.Manage,
  );
  const { table, desktopColumns, mobileColumns, sortFields } =
    useListMembersTable(listMembers, !online);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-lg font-medium">
            {t("feature.lists.members.title", { name: listMembers.listName })}
          </h1>
          <p className="text-muted-foreground text-xs">
            {t(
              canManage
                ? "feature.lists.members.manageDescription"
                : "feature.lists.members.readDescription",
            )}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          {canManage && (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link to={`/lists/${listMembers.listId}/members/add`} />}
            >
              <UserPlusIcon data-icon="inline-start" />
              {t("feature.lists.members.add")}
            </Button>
          )}
          <DataTableSort state={table} fields={sortFields} />
        </div>
      </div>

      {!online && (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>{t("feature.sync.offline")}</AlertTitle>
          <AlertDescription>
            {t("feature.lists.members.offline")}
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        desktopColumns={desktopColumns}
        mobileColumns={mobileColumns}
        data={listMembers.members ?? []}
        state={table}
        getRowId={(member) => member.userId}
      />
    </div>
  );
}
