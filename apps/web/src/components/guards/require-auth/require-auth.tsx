import SessionLoader from "@/components/session-loader";
import { redirectState } from "@/lib/redirect-state";
import { useSession } from "@/hooks/use-session";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RequireAuthContext } from "./require-auth-context";
import ServiceUnavailablePage from "@/components/errors/service-unavailable-page";

export default function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <SessionLoader />;
  if (session.isError) return <ServiceUnavailablePage />;
  if (!session?.data)
    return <Navigate to="/login" state={redirectState(location)} replace />;

  return (
    <RequireAuthContext value={session.data}>
      <Outlet />
    </RequireAuthContext>
  );
}
