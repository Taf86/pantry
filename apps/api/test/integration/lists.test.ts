import { MAX_LISTS_PER_USER, Permission, Role, can } from "@pantry/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listItems } from "../../src/db/schema/list-items.js";
import { users } from "../../src/db/schema/users.js";
import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import {
  createList,
  deleteList,
  getList,
  leaveList,
  listLists,
  removeMember,
  setMember,
  updateList,
} from "../../src/services/lists/lists.service.js";
import {
  createRecordingEventBus,
  type RecordingEventBus,
} from "../../src/realtime/events.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

describe("lists", () => {
  let harness: Harness;
  let events: RecordingEventBus;
  let owner: string;
  let mate: string;

  const deps = () => ({ db: harness.db, events });
  const mutation = () => ({ mutationId: crypto.randomUUID() });

  const newList = async (name = "Spesa") => {
    const created = await createList(deps(), owner, {
      ...mutation(),
      id: crypto.randomUUID(),
      name,
    });
    events.reset();
    return created;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    events = createRecordingEventBus();
    owner = await makeUser(harness, { status: "active" });
    mate = await makeUser(harness, { status: "active" });
  });

  describe("creating", () => {
    it("makes the creator the only manager", async () => {
      const list = await newList();

      expect(list.permissions).toBe(Role.Owner);
      expect(list.memberCount).toBe(1);
    });

    it("stores the list under the id the client generated", async () => {
      const id = crypto.randomUUID();
      await createList(deps(), owner, { ...mutation(), id, name: "Spesa" });

      const [row] = await harness.db
        .select()
        .from(lists)
        .where(eq(lists.id, id));
      expect(row?.id).toBe(id);
    });

    it("records the creator without granting them anything by it", async () => {
      const list = await newList();

      await harness.db
        .delete(listMembers)
        .where(eq(listMembers.listId, list.id));

      await expect(getList(deps(), list.id, owner)).rejects.toThrow(
        /not existing/i,
      );
    });

    it("returns the stored list without creating a second one on a replay", async () => {
      const input = { ...mutation(), id: crypto.randomUUID(), name: "Spesa" };
      await createList(deps(), owner, input);
      const replayed = await createList(deps(), owner, input);

      expect(replayed.id).toBe(input.id);
      expect(await listLists(deps(), owner)).toHaveLength(1);
    });

    it("refuses to create more lists than the cap allows", async () => {
      for (let i = 0; i < MAX_LISTS_PER_USER; i += 1)
        await newList(`L${String(i)}`);

      await expect(newList("one too many")).rejects.toThrow(/too many lists/i);
    });
  });

  describe("reading", () => {
    it("returns the caller own mask alongside each list", async () => {
      const list = await newList();
      await setMember(deps(), owner, {
        ...mutation(),
        listId: list.id,
        userId: mate,
        permissions: Role.Shopper,
      });

      const [seen] = await listLists(deps(), mate);
      expect(seen?.permissions).toBe(Role.Shopper);
      expect(can(seen?.permissions ?? 0, Permission.Write)).toBe(false);
    });

    it("counts only the unchecked, undeleted items as open", async () => {
      const list = await newList();
      const base = { listId: list.id, rawText: "pane", name: "pane" };
      await harness.db.insert(listItems).values([
        { ...base, id: crypto.randomUUID() },
        {
          ...base,
          id: crypto.randomUUID(),
          checkedAt: new Date(),
          checkedBy: owner,
        },
        { ...base, id: crypto.randomUUID(), deletedAt: new Date() },
      ]);

      const [seen] = await listLists(deps(), owner);
      expect(seen?.openItemCount).toBe(1);
    });

    it("takes a deleted list away from every member", async () => {
      const list = await newList();
      await deleteList(deps(), owner, { ...mutation(), listId: list.id });

      expect(await listLists(deps(), owner)).toEqual([]);
      await expect(getList(deps(), list.id, owner)).rejects.toThrow(
        /not existing/i,
      );
    });

    it("shows a stranger nothing", async () => {
      await newList();

      expect(await listLists(deps(), mate)).toEqual([]);
    });
  });

  describe("membership", () => {
    it("lets a manager who did not create the list delete it", async () => {
      const list = await newList();
      await setMember(deps(), owner, {
        ...mutation(),
        listId: list.id,
        userId: mate,
        permissions: Role.Owner,
      });

      await expect(
        deleteList(deps(), mate, { ...mutation(), listId: list.id }),
      ).resolves.toBeUndefined();
    });

    it("refuses to demote the last manager of the list", async () => {
      const list = await newList();

      await expect(
        setMember(deps(), owner, {
          ...mutation(),
          listId: list.id,
          userId: owner,
          permissions: Role.Editor,
        }),
      ).rejects.toThrow(/at least one member who can manage/i);
    });

    it("refuses to remove the last manager of the list", async () => {
      const list = await newList();

      await expect(
        removeMember(deps(), owner, {
          ...mutation(),
          listId: list.id,
          userId: owner,
        }),
      ).rejects.toThrow(/at least one member who can manage/i);
    });

    it("lets the last manager go once somebody else can manage", async () => {
      const list = await newList();
      await setMember(deps(), owner, {
        ...mutation(),
        listId: list.id,
        userId: mate,
        permissions: Role.Owner,
      });

      await expect(
        leaveList(deps(), owner, { ...mutation(), listId: list.id }),
      ).resolves.toBeUndefined();
      expect(await listLists(deps(), owner)).toEqual([]);
    });

    it("updates an existing member instead of adding a second row", async () => {
      const list = await newList();
      const share = (permissions: number) =>
        setMember(deps(), owner, {
          ...mutation(),
          listId: list.id,
          userId: mate,
          permissions,
        });

      await share(Role.Viewer);
      const members = await share(Role.Editor);

      expect(members).toHaveLength(2);
      expect(members.find((m) => m.user.id === mate)?.permissions).toBe(
        Role.Editor,
      );
    });

    it("refuses to share a list with somebody who does not exist", async () => {
      const list = await newList();

      await expect(
        setMember(deps(), owner, {
          ...mutation(),
          listId: list.id,
          userId: "nobody",
          permissions: Role.Editor,
        }),
      ).rejects.toThrow(/not existing/i);
    });
  });

  describe("notifications", () => {
    it("announces a rename to the room of its list", async () => {
      const list = await newList();
      await updateList(deps(), owner, {
        ...mutation(),
        listId: list.id,
        name: "Spesa grande",
      });

      expect(events.events).toEqual([
        expect.objectContaining({ type: "list.updated", listId: list.id }),
      ]);
    });

    it("forces a removed member out of the room, not merely tells them", async () => {
      const list = await newList();
      await setMember(deps(), owner, {
        ...mutation(),
        listId: list.id,
        userId: mate,
        permissions: Role.Editor,
      });
      events.reset();

      await removeMember(deps(), owner, {
        ...mutation(),
        listId: list.id,
        userId: mate,
      });

      expect(events.events).toEqual([
        expect.objectContaining({
          type: "list.member.changed",
          permissions: null,
        }),
      ]);
      expect(events.revoked).toEqual([{ listId: list.id, userId: mate }]);
    });

    it("says nothing when a delete was already applied", async () => {
      const list = await newList();
      const input = { ...mutation(), listId: list.id };

      await deleteList(deps(), owner, input);
      events.reset();
      await deleteList(deps(), owner, input);

      expect(events.events).toEqual([]);
    });
  });
});

describe("a list and the account that made it", () => {
  let harness: Harness;
  let events: RecordingEventBus;

  const deps = () => ({ db: harness.db, events });
  const mutation = () => ({ mutationId: crypto.randomUUID() });

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    events = createRecordingEventBus();
  });

  it("goes when the creator's account goes, even for the others on it", async () => {
    const creator = await makeUser(harness, { status: "active" });
    const guest = await makeUser(harness, { status: "active" });
    const list = await createList(deps(), creator, {
      ...mutation(),
      id: crypto.randomUUID(),
      name: "Spesa",
    });
    await setMember(deps(), creator, {
      ...mutation(),
      listId: list.id,
      userId: guest,
      permissions: Role.Owner,
    });

    await harness.db.delete(users).where(eq(users.id, creator));

    // Creating a list confers no permission, but it does confer lifetime:
    // the guest could manage this list, and it is gone anyway.
    expect(await listLists(deps(), guest)).toEqual([]);
    expect(await harness.db.select().from(lists)).toEqual([]);
  });

  it("survives losing a member who merely belonged to it", async () => {
    const creator = await makeUser(harness, { status: "active" });
    const guest = await makeUser(harness, { status: "active" });
    const list = await createList(deps(), creator, {
      ...mutation(),
      id: crypto.randomUUID(),
      name: "Spesa",
    });
    await setMember(deps(), creator, {
      ...mutation(),
      listId: list.id,
      userId: guest,
      permissions: Role.Editor,
    });

    await harness.db.delete(users).where(eq(users.id, guest));

    expect(await listLists(deps(), creator)).toHaveLength(1);
  });

  it("cannot be left with members but nobody able to manage it", async () => {
    // The invariant the cascade buys: the only account that could strand a
    // list this way is the creator, and deleting it deletes the list.
    const creator = await makeUser(harness, { status: "active" });
    const list = await createList(deps(), creator, {
      ...mutation(),
      id: crypto.randomUUID(),
      name: "Spesa",
    });

    await harness.db.delete(users).where(eq(users.id, creator));

    expect(
      await harness.db
        .select()
        .from(listMembers)
        .where(eq(listMembers.listId, list.id)),
    ).toEqual([]);
  });
});
