import type { SessionUser } from "pantry-shared";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/layout";
import { Loading } from "./components/ui";
import { AdminUsersPage } from "./features/admin/admin-users-page";
import { InvitePage } from "./features/auth/invite-page";
import { LoginPage } from "./features/auth/login-page";
import { SignupPage } from "./features/auth/signup-page";
import { ListDetailPage } from "./features/lists/list-detail-page";
import { ListsPage } from "./features/lists/lists-page";
import { PantriesPage } from "./features/pantries/pantries-page";
import { PantryDetailPage } from "./features/pantries/pantry-detail-page";
import { ShoppingPage } from "./features/shopping/shopping-page";
import { useSession } from "./hooks/use-session";
import { SocketProvider } from "./providers/socket-provider";

const RequireAdmin = ({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) =>
  user.role === "admin" ? <>{children}</> : <Navigate to="/lists" replace />;

export const App = () => {
  const session = useSession();

  if (session.isPending) return <Loading what="dell'applicazione" />;

  const user = session.data ?? null;

  return (
    <SocketProvider enabled={user !== null}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />

        {user === null ? (
          <Route path="*" element={<Navigate to="/login" replace />} />
        ) : (
          <Route element={<Layout user={user} />}>
            <Route path="/" element={<Navigate to="/lists" replace />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/lists/:listId" element={<ListDetailPage />} />
            <Route path="/shopping" element={<ShoppingPage />} />
            <Route path="/pantries" element={<PantriesPage />} />
            <Route path="/pantries/:pantryId" element={<PantryDetailPage />} />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin user={user}>
                  <AdminUsersPage />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/lists" replace />} />
          </Route>
        )}
      </Routes>
    </SocketProvider>
  );
};

export default App;
