import { RequestType } from "@pantry/shared";
import {
  createBrowserRouter,
  replace,
  RouterProvider,
} from "react-router-dom";
import Layout from "./components/layout/layout";
import LoginPage from "./features/auth/login-page";
import InvitePage from "./features/auth/invite-page";
import RequireAuth from "./components/guards/require-auth/require-auth";
import MainLayout from "./components/layout/main-layout";
import ListsPage from "./features/lists/lists-page";
import RequireAdmin from "./components/guards/require-admin";
import UsersPage from "./features/admin/users/users-page";
import UserPage from "./features/admin/user-page";
import NotFoundPage from "./components/errors/not-found-page";
import RequireGuest from "./components/guards/require-guest";
import InvitesPage from "./features/admin/invites/invites-page";
import RequestsPage from "./features/admin/requests/requests-page";
import RequestPage from "./features/auth/request-page";
import ShoppingPage from "./features/shopping/shopping-page";
import PantriesPage from "./features/pantries/pantries-page";
import UnknownErrorPage from "./components/errors/unknown-error-page";
import RootLayout from "./components/layout/root-layout";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <UnknownErrorPage />,
    children: [
      {
        element: <RequireGuest />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: "login", element: <LoginPage /> },
              {
                path: "signup",
                element: <RequestPage type={RequestType.signup} />,
              },
              {
                path: "reset",
                element: <RequestPage type={RequestType.reset_password} />,
              },
            ],
          },
        ],
      },

      {
        element: <RequireAuth />,
        children: [
          {
            element: <MainLayout />,
            children: [
              // `replace` e non `redirect`: quest'ultimo impila una voce di
              // cronologia, quindi la PWA aperta su "/" partiva già con un
              // indietro di troppo prima di chiudersi.
              { index: true, loader: () => replace("/lists") },
              { path: "lists", element: <ListsPage /> },
              { path: "shopping", element: <ShoppingPage /> },
              { path: "pantries", element: <PantriesPage /> },
              {
                path: "admin",
                element: <RequireAdmin />,
                children: [
                  { index: true, loader: () => replace("/admin/users") },
                  { path: "users", element: <UsersPage /> },
                  { path: "users/create", element: <UserPage /> },
                  { path: "users/:userId", element: <UserPage /> },
                  { path: "invites", element: <InvitesPage /> },
                  { path: "requests", element: <RequestsPage /> },
                ],
              },
            ],
          },
        ],
      },

      {
        element: <Layout />,
        children: [
          { path: "invite/:token", element: <InvitePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default function Router() {
  return <RouterProvider router={router} />;
}
