import { listRoom, userRoom, type ServerEvent } from "@pantry/shared";
import { describe, expect, it } from "vitest";

import { roomsOf } from "../../src/realtime/routing.js";

const LIST = "0199a0d0-0000-7000-8000-000000000001";
const OTHER = "0199a0d0-0000-7000-8000-000000000002";

const listOnly: ServerEvent[] = [
  { type: "item.deleted", listId: LIST, itemId: OTHER },
  { type: "list.deleted", listId: LIST },
  { type: "session.ended", listId: LIST, sessionId: OTHER, reason: "released" },
];

describe("roomsOf", () => {
  it.each(listOnly)("routes $type to the room of its list only", (event) => {
    expect(roomsOf(event)).toEqual([listRoom(LIST)]);
  });

  it("routes a membership change to the list and to the member concerned", () => {
    expect(
      roomsOf({
        type: "list.member.changed",
        listId: LIST,
        userId: "anna",
        permissions: null,
      }),
    ).toEqual([listRoom(LIST), userRoom("anna")]);
  });

  it("gives two lists two different rooms", () => {
    expect(roomsOf({ type: "list.deleted", listId: LIST })).not.toEqual(
      roomsOf({ type: "list.deleted", listId: OTHER }),
    );
  });

  it("namespaces the rooms, so a list id cannot collide with a user id", () => {
    expect(listRoom(LIST)).toBe(`list:${LIST}`);
    expect(userRoom(LIST)).toBe(`user:${LIST}`);
  });
});
