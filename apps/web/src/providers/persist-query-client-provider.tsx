import {
  createAppQueryClient,
  persistOptions,
} from "@/lib/persist-query-client";
import { PersistQueryClientProvider as TanStackPersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";

const queryClient = createAppQueryClient();

export default function PersistQueryClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TanStackPersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      {children}
    </TanStackPersistQueryClientProvider>
  );
}
