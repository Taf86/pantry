import { useQueryClient } from "@tanstack/react-query";
import type { SessionUser } from "pantry-shared";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { signOut } from "../lib/auth-client";
import { Button } from "./ui";
import { Notices } from "./notices";
import { SyncBadge } from "./sync-badge";

const NAV = [
  { to: "/lists", label: "Liste" },
  { to: "/shopping", label: "Spesa" },
  { to: "/pantries", label: "Dispense" },
] as const;

export const Layout = ({ user }: { user: SessionUser }) => {
  const navigate = useNavigate();
  const client = useQueryClient();

  const logout = async (): Promise<void> => {
    await signOut();
    // La cache persistita contiene dati di questo utente: al logout se ne va.
    await client.cancelQueries();
    client.clear();
    void navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/lists" className="app-header__brand">
          Pantry
        </NavLink>
        <span className="app-header__spacer" />
        <SyncBadge />
        <Button size="small" variant="ghost" onClick={() => void logout()}>
          Esci
        </Button>
      </header>

      <nav className="app-nav" aria-label="Sezioni">
        {NAV.map((entry) => (
          <NavLink key={entry.to} to={entry.to}>
            {entry.label}
          </NavLink>
        ))}
        {user.role === "admin" && (
          <NavLink to="/admin/users">Backoffice</NavLink>
        )}
      </nav>

      <main className="app-main">
        <Outlet />
      </main>

      <Notices />
    </div>
  );
};
