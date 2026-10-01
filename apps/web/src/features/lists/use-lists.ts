import { useQuery } from "@tanstack/react-query";

import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";

export const useLists = () =>
  useQuery({
    queryKey: keys.lists(),
    queryFn: () => trpc.lists.list.query(),
  });
