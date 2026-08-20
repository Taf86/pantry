import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/layout";
import LoginPage from "./features/auth/login-page";
import InvitePage from "./features/auth/invite-page";
import RequireAuth from "./components/guards/require-auth/require-auth";
import MainLayout from "./components/layout/main-layout";
import ListsPage from "./features/lists/lists-page";
import RequireAdmin from "./components/guards/require-admin";
import UsersPage from "./features/admin/users-page";
import NotFoundPage from "./components/errors/not-found-page";
import RequireGuest from "./components/guards/require-guest";

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RequireGuest />}>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<MainLayout />}>
            <Route index element={<Navigate to="/lists" replace />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/admin" element={<RequireAdmin />}>
              <Route index element={<Navigate to="/admin/users" replace />} />
              <Route path="users" element={<UsersPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<Layout />}>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
