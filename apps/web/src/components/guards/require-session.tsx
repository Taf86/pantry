import { useSession } from "@/hooks/use-session";
import SessionLoader from "../session-loader";
import ServiceUnavailablePage from "../errors/service-unavailable-page";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useSession();

  if (session.isPending) return <SessionLoader />;
  if (session.isError) return <ServiceUnavailablePage />;

  return <>{children}</>;
}
