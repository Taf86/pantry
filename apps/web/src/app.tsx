import { RequireSession } from "./components/guards/require-session";
import PersistQueryClientProvider from "./providers/persist-query-client-provider";
import Router from "./router";

export default function App() {
  return (
    <PersistQueryClientProvider>
      <RequireSession>
        <Router />
      </RequireSession>
    </PersistQueryClientProvider>
  );
}
