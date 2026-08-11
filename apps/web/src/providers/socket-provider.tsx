import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { createSocket } from "../lib/socket";
import { SocketContext } from "./socket-context";

/**
 * Una sola connessione per l'intera applicazione.
 *
 * Il client apre il socket una volta e fa `join` su tutte le room che sta
 * guardando: la vista multi-lista della modalità spesa è una fusione lato
 * client, non un concetto che il server conosce.
 *
 * L'oggetto socket nasce con `autoConnect: false`, quindi crearlo non è un
 * effetto collaterale: la connessione vera la decide l'effetto qui sotto,
 * quando c'è una sessione da presentare all'handshake.
 */
export const SocketProvider = ({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) => {
  const client = useQueryClient();
  const [socket] = useState(() => createSocket(client));

  useEffect(() => {
    if (enabled) socket.connect();
    else socket.disconnect();
  }, [enabled, socket]);

  useEffect(
    () => () => {
      socket.disconnect();
    },
    [socket],
  );

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
