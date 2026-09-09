import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { clearLocalUserData } from "@/lib/local-data";
import {
  readLastUser,
  rememberLastUser,
  forgetLastUser,
} from "@/lib/last-user";
import SessionLoader from "../session-loader";
import ServiceUnavailablePage from "../errors/service-unavailable-page";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const currentUserId = session.data?.id ?? null;

  useEffect(() => {
    if (session.isPending || session.isError) return;
    const lastUserId = readLastUser();
    if (lastUserId === currentUserId) return;
    if (lastUserId !== null) {
      void clearLocalUserData(queryClient);
    }
    if (currentUserId === null) forgetLastUser();
    else rememberLastUser(currentUserId);
  }, [session.isPending, session.isError, currentUserId, queryClient]);

  if (session.isPending) return <SessionLoader />;
  if (session.isError) return <ServiceUnavailablePage />;

  return <>{children}</>;
}
