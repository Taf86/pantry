import { useLocation, useNavigate } from "react-router-dom";

/**
 * State to pass on links that open a form page, so the form can leave by
 * going back in history instead of pushing the list page again.
 */
export const formReturnState = { formReturn: true } as const;

/**
 * Returns a function that leaves the current form page. When the form was
 * opened from an in-app link (carrying `formReturnState`) it goes back, so the
 * form ends up out of the back history; otherwise (deep link, notification)
 * it replaces the form with `fallbackPath`.
 */
export default function useLeaveForm(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack =
    (location.state as { formReturn?: boolean } | null)?.formReturn === true;

  return () =>
    canGoBack ? navigate(-1) : navigate(fallbackPath, { replace: true });
}
