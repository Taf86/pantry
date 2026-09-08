import SessionLoader from "@/components/session-loader";
import { useSession } from "@/hooks/use-session";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import ServiceUnavailablePage from "../errors/service-unavailable-page";

export default function RequireGuest() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <SessionLoader />;
  if (session.isError) return <ServiceUnavailablePage />;
  if (session?.data)
    return <Navigate to={location.state?.from?.pathname ?? "/lists"} replace />;

  return <Outlet />;
}
