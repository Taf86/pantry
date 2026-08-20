import { Outlet } from "react-router-dom";

export default function MainLayout() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        nav
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
