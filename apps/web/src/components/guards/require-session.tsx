import { useSession } from "@/hooks/use-session";
import FullPageSpinner from "../full-page-spinner";
import ServiceUnavailablePage from "../errors/service-unavailable-page";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useSession();

  if (session.isPending) return <FullPageSpinner />;
  if (session.isError) return <ServiceUnavailablePage />;

  return <>{children}</>;
}
