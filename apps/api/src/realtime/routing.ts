import { listRoom, type ServerEvent } from "@pantry/shared";

/**
 * The room an event is delivered to.
 *
 * One exhaustive switch, deliberately: adding an event type without deciding
 * where it goes becomes a compilation error rather than a notification that
 * silently reaches nobody. That failure mode is almost impossible to notice in
 * testing and trivially obvious to a user, which is the worst combination.
 */
export const roomOf = (event: ServerEvent): string => {
  switch (event.type) {
    case "item.upserted":
    case "item.deleted":
    case "list.updated":
    case "list.deleted":
    case "list.member.changed":
    case "session.started":
    case "session.ended":
      return listRoom(event.listId);
  }
};
