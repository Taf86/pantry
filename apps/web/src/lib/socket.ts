import type { QueryClient } from "@tanstack/react-query";
import {
  JOIN_EVENT,
  LEAVE_EVENT,
  MAX_JOINED_ROOMS,
  REALTIME_PATH,
  SERVER_EVENT,
  serverEventSchema,
  type DeleteListInput,
  type RemoveMemberInput,
  type ServerEvent,
  type User,
} from "@pantry/shared";
import { io, type Socket } from "socket.io-client";

import { findListSummary, removeListSummary, renameList } from "./cache";
import { keys } from "./keys";
import { MUTATION } from "./mutations";

export interface RemoteNotice {
  kind: "deleted" | "revoked";
  name: string;
}

const meId = (client: QueryClient): string | null =>
  client.getQueryData<User | null>(keys.me())?.id ?? null;

const isOwnExit = (
  client: QueryClient,
  listId: string,
  me: string | null,
): boolean =>
  client
    .getMutationCache()
    .getAll()
    .some((mutation) => {
      const name = mutation.options.mutationKey?.[0];
      if (name === MUTATION.listDelete) {
        return (mutation.state.variables as DeleteListInput).listId === listId;
      }
      if (name === MUTATION.listMemberRemove) {
        const input = mutation.state.variables as RemoveMemberInput;
        return input.listId === listId && input.userId === me;
      }
      return false;
    });

const forgetList = (
  client: QueryClient,
  listId: string,
  kind: RemoteNotice["kind"],
): RemoteNotice | null => {
  const me = meId(client);
  const known = findListSummary(client, listId);
  removeListSummary(client, listId);
  client.removeQueries({ queryKey: keys.list(listId) });

  if (!known || isOwnExit(client, listId, me)) return null;
  return { kind, name: known.name };
};

const invalidateLists = (client: QueryClient): void => {
  void client.invalidateQueries({ queryKey: keys.lists(), exact: true });
};

const invalidateListMembers = (client: QueryClient, listId: string): void => {
  void client.invalidateQueries({ queryKey: keys.listMembers(listId) });
};

export const applyServerEvent = (
  client: QueryClient,
  event: ServerEvent,
): RemoteNotice | null => {
  switch (event.type) {
    case "item.upserted":
      return null;

    case "item.deleted":
      return null;

    case "list.updated":
      renameList(client, event.listId, event.list.name);
      invalidateLists(client);
      return null;

    case "list.deleted":
      return forgetList(client, event.listId, "deleted");

    case "list.member.changed": {
      if (event.userId === meId(client)) {
        if (event.permissions === null) {
          return forgetList(client, event.listId, "revoked");
        }
      }
      invalidateLists(client);
      invalidateListMembers(client, event.listId);
      return null;
    }

    case "session.started":
      return null;

    case "session.ended":
      return null;
  }
};

export const resyncAfterReconnect = (client: QueryClient): void => {
  invalidateLists(client);
  void client.invalidateQueries({ queryKey: ["list"] });
};

export const createSocket = (
  client: QueryClient,
  onNotice: (notice: RemoteNotice) => void,
): Socket => {
  const socket = io({
    path: REALTIME_PATH,
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
  });

  socket.on(SERVER_EVENT, (payload: unknown) => {
    const parsed = serverEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const event = parsed.data;
    if (
      event.type === "list.member.changed" &&
      event.permissions !== null &&
      event.userId === meId(client)
    ) {
      joinLists(socket, [event.listId]);
    }

    const notice = applyServerEvent(client, event);
    if (notice) onNotice(notice);
  });

  return socket;
};

const inSlices = (ids: readonly string[]): string[][] => {
  const slices: string[][] = [];
  for (let at = 0; at < ids.length; at += MAX_JOINED_ROOMS) {
    slices.push(ids.slice(at, at + MAX_JOINED_ROOMS));
  }
  return slices;
};

export const joinLists = (socket: Socket, ids: readonly string[]): void => {
  for (const lists of inSlices(ids)) socket.emit(JOIN_EVENT, { lists });
};

export const leaveLists = (socket: Socket, ids: readonly string[]): void => {
  for (const lists of inSlices(ids)) socket.emit(LEAVE_EVENT, { lists });
};
