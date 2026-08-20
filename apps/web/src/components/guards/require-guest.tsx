import FullPageSpinner from "@/components/full-page-spinner";
import { useSession } from "@/hooks/use-session";
import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function RequireGuest() {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (user)
    return <Navigate to={location.state?.from?.pathname ?? "/lists"} replace />;

  return <Outlet />;
}
