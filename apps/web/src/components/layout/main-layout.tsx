import { Outlet } from "react-router-dom";
import NavBar from "./nav-bar";

export default function MainLayout() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <NavBar />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
