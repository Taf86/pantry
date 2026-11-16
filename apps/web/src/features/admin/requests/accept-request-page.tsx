import Loader from "@/components/loader";
import ErrorPage from "@/components/errors/error-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import useErrorMessage from "@/hooks/use-error-message";
import { inviteUrl } from "@/lib/invites";
import { keys } from "@/lib/keys";
import { trpc, type ApiError } from "@/lib/trpc";
import {
  RequestStatus,
  RequestType,
  type ApproveRequestInput,
} from "@pantry/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import InviteLinkShare from "../invite-link-share";
import TenantSelect from "../tenants/tenant-select";
import { RequestTypeBadge } from "./request-badges";

const requestsPath = "/admin/requests";

export default function AcceptRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { requestId = "" } = useParams<{ requestId: string }>();

  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apiErrorMessage = (apiError: ApiError) => {
    switch (apiError.data?.code) {
      case "CONFLICT":
        return t("feature.requests.error.decided");
      case "BAD_REQUEST":
        return t("feature.requests.error.tenant");
      case "NOT_FOUND":
        return t("feature.requests.error.noAccount");
      case "FORBIDDEN":
        return t("feature.requests.error.suspended");
      default:
        return null;
    }
  };
  const errorMessage = useErrorMessage(apiErrorMessage);

  const request = useQuery({
    queryKey: keys.adminRequest(requestId),
    queryFn: () => trpc.admin.requests.get.query({ requestId }),
    retry: false,
    networkMode: "online",
  });

  const approve = useMutation({
    mutationFn: (input: ApproveRequestInput) =>
      trpc.admin.requests.approve.mutate(input),
    networkMode: "online",
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.adminRequests() });
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers() });
      await queryClient.invalidateQueries({ queryKey: keys.adminInvites() });
    },
    onError: (cause: unknown) => setError(errorMessage(cause)),
  });

  if (request.isPending) return <Loader />;
  if (request.isError) {
    return (
      <ErrorPage
        title={t("feature.requests.accept.notFoundTitle")}
        description={t("feature.requests.accept.notFound")}
      />
    );
  }

  const data = request.data;
  const isSignup = data.type === RequestType.signup;
  const approved = approve.data;
  const locked = approved !== undefined;
  const decided = !locked && data.status !== RequestStatus.pending;
  const url = approved ? inviteUrl(approved.invite) : "";

  const confirm = () => {
    setError(null);
    approve.mutate(
      isSignup
        ? { type: RequestType.signup, requestId, tenantId }
        : { type: RequestType.reset_password, requestId },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-medium">
        {t("feature.requests.accept.title")}
      </h1>

      <FieldGroup>
        <FieldSet className="max-w-md">
          <FieldDescription>
            {t(
              isSignup
                ? "feature.requests.accept.descriptionSignup"
                : "feature.requests.accept.descriptionReset",
            )}
          </FieldDescription>

          <FieldGroup>
            <Field>
              <FieldLabel>{t("feature.requests.accept.type")}</FieldLabel>
              <div>
                <RequestTypeBadge type={data.type} />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="request-email">
                {t("feature.requests.accept.email")}
              </FieldLabel>
              <Input id="request-email" readOnly value={data.email} />
            </Field>

            {data.displayName !== null && (
              <Field>
                <FieldLabel htmlFor="request-name">
                  {t("feature.requests.accept.name")}
                </FieldLabel>
                <Input id="request-name" readOnly value={data.displayName} />
              </Field>
            )}

            {isSignup && (
              <Field>
                <FieldLabel htmlFor="request-tenant">
                  {t("feature.requests.accept.tenant")}
                </FieldLabel>
                <TenantSelect
                  id="request-tenant"
                  value={tenantId}
                  onChange={setTenantId}
                  disabled={approve.isPending || locked || decided}
                />
              </Field>
            )}
          </FieldGroup>

          {decided && (
            <Alert>
              <InfoIcon />
              <AlertTitle>
                {t("feature.requests.accept.alreadyDecided")}
              </AlertTitle>
            </Alert>
          )}

          {error !== null && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t("feature.requests.accept.failed")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Field orientation="horizontal">
            <Button
              type="button"
              disabled={
                approve.isPending ||
                locked ||
                decided ||
                (isSignup && tenantId === "")
              }
              onClick={confirm}
            >
              {t("feature.requests.accept.confirm")}
            </Button>
            {!locked && (
              <Button
                type="button"
                variant="outline"
                disabled={approve.isPending}
                onClick={() => void navigate(requestsPath)}
              >
                {t("feature.requests.accept.cancel")}
              </Button>
            )}
          </Field>
        </FieldSet>

        <FieldSeparator className="max-w-md" />

        <InviteLinkShare
          className="max-w-md"
          url={url}
          recipient={approved?.user}
          placeholder={t("feature.requests.accept.linkPending")}
          warningTitle={t("feature.requests.accept.warningTitle")}
        />

        {locked && (
          <Field orientation="horizontal">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void navigate(requestsPath)}
            >
              {t("feature.requests.accept.close")}
            </Button>
          </Field>
        )}
      </FieldGroup>
    </div>
  );
}
