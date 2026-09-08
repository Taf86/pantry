import { authErrorKey, isAuthError } from "@/lib/auth-client";
import { isApiError, type ApiError } from "@/lib/trpc";
import { useTranslation } from "react-i18next";

export default function useErrorMessage(
  apiErrorMessage?: (error: ApiError) => string | null,
) {
  const { t } = useTranslation();

  const errorMessage = (error: unknown): string => {
    if (isApiError(error)) {
      const message = apiErrorMessage?.(error);
      if (message) return message;
    }
    const authError = isAuthError(error);
    if (authError) {
      return t(authErrorKey(authError));
    }
    return t("error.unknown");
  };

  return errorMessage;
}
