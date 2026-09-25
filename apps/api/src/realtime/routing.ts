import { listRoom, userRoom, type ServerEvent } from "@pantry/shared";

/**
 * The rooms an event is delivered to.
 *
 * One exhaustive switch, deliberately: adding an event type without deciding
 * where it goes becomes a compilation error rather than a notification that
 * silently reaches nobody. That failure mode is almost impossible to notice in
 * testing and trivially obvious to a user, which is the worst combination.
 *
 * Several rooms are emitted to in one call, never one call per room: Socket.IO
 * then delivers once per socket, so a member who is in both rooms does not get
 * the same event twice.
 */
export const roomsOf = (event: ServerEvent): string[] => {
  switch (event.type) {
    case "item.upserted":
    case "item.deleted":
    case "list.updated":
    case "list.deleted":
    case "session.started":
    case "session.ended":
      return [listRoom(event.listId)];
    // The other members follow the list; the member concerned may not be in
    // its room at all — just added, they do not know the list exists yet.
    case "list.member.changed":
      return [listRoom(event.listId), userRoom(event.userId)];
  }
};
