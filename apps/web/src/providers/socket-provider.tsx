import { useQueryClient } from "@tanstack/react-query";
import type { ListSummary } from "@pantry/shared";
import i18n from "i18next";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { toast } from "@/components/ui/toast";
import { useLists } from "@/features/lists/common/use-lists";
import { keys } from "@/lib/keys";
import {
  createSocket,
  joinLists,
  leaveLists,
  resyncAfterReconnect,
  type RemoteNotice,
} from "@/lib/socket";

const showNotice = (notice: RemoteNotice): void => {
  toast.add({
    type: "info",
    description:
      notice.kind === "deleted"
        ? i18n.t("feature.lists.index.deletedRemotely", { name: notice.name })
        : i18n.t("feature.lists.index.accessRevoked", { name: notice.name }),
  });
};

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const client = useQueryClient();
  const [socket] = useState(() => createSocket(client, showNotice));

  const lists = useLists();
  const idsKey = (lists.data ?? []).map((list) => list.id).join(",");
  const ids = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);

  const joined = useRef(new Set<string>());

  useEffect(() => {
    let reconnecting = false;

    const onConnect = () => {
      const all = (client.getQueryData<ListSummary[]>(keys.lists()) ?? []).map(
        (list) => list.id,
      );
      joined.current = new Set(all);
      joinLists(socket, all);
      if (reconnecting) resyncAfterReconnect(client);
      reconnecting = true;
    };

    socket.on("connect", onConnect);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.disconnect();
    };
  }, [socket, client]);

  useEffect(() => {
    if (!socket.connected) return;

    const next = new Set(ids);
    const added = ids.filter((id) => !joined.current.has(id));
    const removed = [...joined.current].filter((id) => !next.has(id));

    if (added.length > 0) joinLists(socket, added);
    if (removed.length > 0) leaveLists(socket, removed);
    joined.current = next;
  }, [ids, socket]);

  return <>{children}</>;
};
