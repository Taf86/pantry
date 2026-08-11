import { listRoom, pantryRoom, type ServerEvent } from "pantry-shared";
import { describe, expect, it } from "vitest";

import { roomOf } from "../src/realtime/routing.js";

const LIST = "01930d1e-0000-7000-8000-0000000000aa";
const PANTRY = "01930d1e-0000-7000-8000-0000000000bb";

describe("roomOf", () => {
  it("instrada gli eventi di lista nella room della lista", () => {
    const events: ServerEvent[] = [
      { type: "item.deleted", listId: LIST, itemId: "x" },
      { type: "list.deleted", listId: LIST },
    ];
    for (const event of events) {
      expect(roomOf(event)).toBe(listRoom(LIST));
    }
  });

  it("instrada gli eventi di dispensa nella room della dispensa", () => {
    const events: ServerEvent[] = [
      { type: "pantry.node.deleted", pantryId: PANTRY, nodeId: "x" },
      { type: "pantry.deleted", pantryId: PANTRY },
    ];
    for (const event of events) {
      expect(roomOf(event)).toBe(pantryRoom(PANTRY));
    }
  });

  it("non confonde due room con lo stesso identificativo", () => {
    expect(listRoom(LIST)).not.toBe(pantryRoom(LIST));
  });
});
