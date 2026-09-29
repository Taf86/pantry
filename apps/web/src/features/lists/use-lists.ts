import { useQuery } from "@tanstack/react-query";

import { keys } from "@/lib/keys";
import { trpc } from "@/lib/trpc";

/** Every list the user belongs to, with their own mask on each. */
export const useLists = () =>
  useQuery({
    queryKey: keys.lists(),
    queryFn: () => trpc.lists.list.query(),
  });

/** One list with its members. */
export const useListDetail = (listId: string) =>
  useQuery({
    queryKey: keys.list(listId),
    queryFn: () => trpc.lists.get.query({ listId }),
  });
