import { listRoom, type ServerEvent } from "@pantry/shared";
import { describe, expect, it } from "vitest";

import { roomOf } from "../../src/realtime/routing.js";

const LIST = "0199a0d0-0000-7000-8000-000000000001";
const OTHER = "0199a0d0-0000-7000-8000-000000000002";

const events: ServerEvent[] = [
  { type: "item.deleted", listId: LIST, itemId: OTHER },
  { type: "list.deleted", listId: LIST },
  {
    type: "list.member.changed",
    listId: LIST,
    userId: "anna",
    permissions: null,
  },
  { type: "session.ended", listId: LIST, sessionId: OTHER, reason: "released" },
];

describe("roomOf", () => {
  it.each(events)("routes $type to the room of its list", (event) => {
    expect(roomOf(event)).toBe(listRoom(LIST));
  });

  it("gives two lists two different rooms", () => {
    expect(roomOf({ type: "list.deleted", listId: LIST })).not.toBe(
      roomOf({ type: "list.deleted", listId: OTHER }),
    );
  });

  it("namespaces the room, so an id cannot collide with another kind of room", () => {
    expect(listRoom(LIST)).toBe(`list:${LIST}`);
  });
});
