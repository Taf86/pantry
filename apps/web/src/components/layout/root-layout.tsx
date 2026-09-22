import { PUSH_NAVIGATE_MESSAGE } from "@/lib/push";
import { useEffect } from "react";
import { Outlet, ScrollRestoration, useNavigate } from "react-router-dom";

export default function RootLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const worker =
      "serviceWorker" in navigator ? navigator.serviceWorker : null;
    if (!worker) return;

    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== PUSH_NAVIGATE_MESSAGE || !data.url) return;
      void navigate(data.url);
    };

    worker.addEventListener("message", onMessage);
    return () => {
      worker.removeEventListener("message", onMessage);
    };
  }, [navigate]);

  return (
    <>
      <Outlet />
      <ScrollRestoration getKey={(location) => location.pathname} />
    </>
  );
}
