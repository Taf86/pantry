import { createContext } from "react";
import type { Socket } from "socket.io-client";

/**
 * Il contesto vive in un modulo suo, separato dal provider e dagli hook.
 *
 * È una concessione al Fast Refresh: un file che esporta sia componenti sia
 * altro perde il refresh a caldo, e in sviluppo lo si nota subito.
 */
export const SocketContext = createContext<Socket | null>(null);
