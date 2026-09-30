import { listRoom, userRoom, type ServerEvent } from "@pantry/shared";

export const roomsOf = (event: ServerEvent): string[] => {
  switch (event.type) {
    case "item.upserted":
    case "item.deleted":
    case "list.updated":
    case "list.deleted":
    case "session.started":
    case "session.ended":
      return [listRoom(event.listId)];
    case "list.member.changed":
      return [listRoom(event.listId), userRoom(event.userId)];
  }
};
