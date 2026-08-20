import useRequireAuth from "@/hooks/use-require-auth";
import { UserRole } from "@pantry/shared";
import { Navigate, Outlet } from "react-router-dom";

export default function RequireAdmin() {
  const user = useRequireAuth();
  if (user?.role !== UserRole.admin) return <Navigate to="/lists" replace />;

  return <Outlet />;
}
