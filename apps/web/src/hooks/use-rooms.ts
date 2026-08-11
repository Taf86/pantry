import { useContext, useEffect } from "react";
import type { Socket } from "socket.io-client";

import { joinRooms, leaveRooms, type RoomSubscription } from "../lib/socket";
import { SocketContext } from "../providers/socket-context";

export const useSocket = (): Socket | null => useContext(SocketContext);

/**
 * Entra nelle room finché il componente è montato.
 *
 * Il `join` si rifà a ogni riconnessione: il server non ricorda le room di un
 * socket caduto, e senza questo dopo un tunnel gli aggiornamenti
 * smetterebbero di arrivare senza che niente lo segnali.
 */
export const useRooms = (rooms: RoomSubscription): void => {
  const socket = useSocket();
  // Le dipendenze sono stringhe, non array: altrimenti un nuovo riferimento a
  // ogni render rifarebbe join e leave in continuazione.
  const lists = (rooms.lists ?? []).join(",");
  const pantries = (rooms.pantries ?? []).join(",");

  useEffect(() => {
    if (!socket) return;

    const subscription: RoomSubscription = {
      lists: lists === "" ? [] : lists.split(","),
      pantries: pantries === "" ? [] : pantries.split(","),
    };

    const join = () => {
      joinRooms(socket, subscription);
    };
    join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);
      if (socket.connected) leaveRooms(socket, subscription);
    };
  }, [socket, lists, pantries]);
};
