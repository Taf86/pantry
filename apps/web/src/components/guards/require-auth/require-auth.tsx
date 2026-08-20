import FullPageSpinner from "@/components/full-page-spinner";
import { useSession } from "@/hooks/use-session";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RequireAuthContext } from "./require-auth-context";

export default function RequireAuth() {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return (
    <RequireAuthContext value={user}>
      <Outlet />
    </RequireAuthContext>
  );
}
