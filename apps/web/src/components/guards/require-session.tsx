import { useSession } from "@/hooks/use-session";
import FullPageSpinner from "../full-page-spinner";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useSession();

  if (session.isPending) return <FullPageSpinner />;
  if (session.isError) return <div>Error</div>;

  return <>{children}</>;
}
