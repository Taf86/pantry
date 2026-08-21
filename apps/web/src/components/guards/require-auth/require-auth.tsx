import FullPageSpinner from "@/components/full-page-spinner";
import { useSession } from "@/hooks/use-session";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RequireAuthContext } from "./require-auth-context";
import ServiceUnavailablePage from "@/components/errors/service-unavailable-page";

export default function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullPageSpinner />;
  if (session.isError) return <ServiceUnavailablePage />;
  if (!session?.data)
    return <Navigate to="/login" state={{ from: location }} replace />;

  return (
    <RequireAuthContext value={session.data}>
      <Outlet />
    </RequireAuthContext>
  );
}
