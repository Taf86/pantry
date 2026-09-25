import { JOIN_EVENT, Role, listRoom } from "@pantry/shared";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";
import {
  collect,
  createRealtimeHarness,
  settle,
  type RealtimeHarness,
} from "../helpers/realtime.js";

describe("the realtime bus", () => {
  let harness: Harness;
  let rt: RealtimeHarness;
  let marco: string;
  let anna: string;
  let listId: string;
  let otherListId: string;

  const makeList = async (members: Array<[string, number]>) => {
    const id = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id, name: "Spesa", createdBy: marco });
    for (const [userId, permissions] of members) {
      await harness.db
        .insert(listMembers)
        .values({ listId: id, userId, permissions });
    }
    return id;
  };

  const anEvent = (id: string) =>
    ({ type: "list.deleted", listId: id }) as const;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    marco = await makeUser(harness, { status: "active" });
    anna = await makeUser(harness, { status: "active" });
    listId = await makeList([
      [marco, Role.Owner],
      [anna, Role.Shopper],
    ]);
    otherListId = await makeList([[marco, Role.Owner]]);
    rt = await createRealtimeHarness(harness);
  });

  afterEach(async () => {
    await rt.close();
  });

  describe("the handshake", () => {
    it("refuses a socket carrying no session", async () => {
      const socket = rt.openAnonymous();
      const failure = await new Promise<Error>((resolve) => {
        socket.once("connect_error", resolve);
      });

      expect(failure.message).toBe("unauthorized");
    });

    it("refuses a socket whose account is suspended", async () => {
      await rt.close();
      rt = await createRealtimeHarness(harness, {
        statusOf: () => "suspended",
      });

      await expect(rt.open(marco)).rejects.toThrow(/unauthorized/i);
    });

    it("accepts a socket carrying an active session", async () => {
      await expect(rt.open(marco)).resolves.toBeDefined();
    });
  });

  describe("joining a room", () => {
    it("delivers an event only to the room of its list", async () => {
      const socket = await rt.open(marco);
      const received = collect(socket);
      socket.emit(JOIN_EVENT, { lists: [listId] });
      await settle();

      rt.realtime.bus.publish(anEvent(otherListId));
      await settle();

      expect(received).toEqual([]);

      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect(received).toEqual([anEvent(listId)]);
    });

    it("refuses a socket that joins a list it cannot read", async () => {
      const stranger = await makeUser(harness, { status: "active" });
      const socket = await rt.open(stranger);
      const received = collect(socket);

      socket.emit(JOIN_EVENT, { lists: [listId] });
      await settle();
      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect(received).toEqual([]);
    });

    it("lets a shopper into the room, because reading is all a room is", async () => {
      const socket = await rt.open(anna);
      const received = collect(socket);

      socket.emit(JOIN_EVENT, { lists: [listId] });
      await settle();
      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect(received).toEqual([anEvent(listId)]);
    });

    it("keeps the authorized lists of a join that also names one it cannot read", async () => {
      const socket = await rt.open(anna);
      const received = collect(socket);

      socket.emit(JOIN_EVENT, { lists: [listId, otherListId] });
      await settle();
      rt.realtime.bus.publish(anEvent(listId));
      rt.realtime.bus.publish(anEvent(otherListId));
      await settle();

      expect(received).toEqual([anEvent(listId)]);
    });

    it("ignores a malformed join instead of dropping the socket", async () => {
      const socket = await rt.open(marco);
      socket.emit(JOIN_EVENT, { lists: "not an array" });
      await settle();

      expect(socket.connected).toBe(true);
    });

    it("delivers to every socket in the room", async () => {
      const first = await rt.open(marco);
      const second = await rt.open(anna);
      const a = collect(first);
      const b = collect(second);
      first.emit(JOIN_EVENT, { lists: [listId] });
      second.emit(JOIN_EVENT, { lists: [listId] });
      await settle();

      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect([a, b]).toEqual([[anEvent(listId)], [anEvent(listId)]]);
    });
  });

  describe("revoking", () => {
    it("stops delivering to a member who has been removed", async () => {
      const socket = await rt.open(anna);
      const received = collect(socket);
      socket.emit(JOIN_EVENT, { lists: [listId] });
      await settle();

      // Publishing that she was removed is not enough: her socket is still in
      // the room, and membership is only checked when joining.
      rt.realtime.bus.revoke(listId, anna);
      await settle();
      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect(received).toEqual([]);
    });

    it("leaves the other members of the room alone", async () => {
      const staying = await rt.open(marco);
      const leaving = await rt.open(anna);
      const kept = collect(staying);
      staying.emit(JOIN_EVENT, { lists: [listId] });
      leaving.emit(JOIN_EVENT, { lists: [listId] });
      await settle();

      rt.realtime.bus.revoke(listId, anna);
      await settle();
      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect(kept).toEqual([anEvent(listId)]);
    });

    it("does not disconnect the socket it revoked", async () => {
      const socket = await rt.open(anna);
      socket.emit(JOIN_EVENT, { lists: [listId] });
      await settle();

      rt.realtime.bus.revoke(listId, anna);
      await settle();

      // She still belongs to her other lists; only one door closed.
      expect(socket.connected).toBe(true);
    });
  });

  describe("what the bus is", () => {
    it("names the room after the list", () => {
      expect(listRoom(listId)).toBe(`list:${listId}`);
    });

    it("delivers nothing to a socket that joined nothing", async () => {
      const socket = await rt.open(marco);
      const received = collect(socket);
      await settle();

      rt.realtime.bus.publish(anEvent(listId));
      await settle();

      expect(received).toEqual([]);
    });
  });
});
