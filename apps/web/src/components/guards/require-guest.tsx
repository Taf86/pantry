import FullPageSpinner from "@/components/full-page-spinner";
import { useSession } from "@/hooks/use-session";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import ServiceUnavailablePage from "../errors/service-unavailable-page";

export default function RequireGuest() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullPageSpinner />;
  if (session.isError) return <ServiceUnavailablePage />;
  if (session?.data)
    return <Navigate to={location.state?.from?.pathname ?? "/lists"} replace />;

  return <Outlet />;
}
