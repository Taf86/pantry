import { useQuery } from "@tanstack/react-query";
import type { User } from "@pantry/shared";

import { keys } from "../lib/keys";
import { trpc } from "../lib/trpc";

export const useSession = () =>
  useQuery<User | null>({
    queryKey: keys.me(),
    queryFn: () => trpc.account.me.query(),
    networkMode: "offlineFirst",
    staleTime: 30_000,
    retry: false,
  });
