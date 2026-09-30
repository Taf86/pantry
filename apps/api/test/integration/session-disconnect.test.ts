import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuth } from "../../src/auth.js";
import {
  createUser,
  deleteUser,
  editUser,
  setStatus,
} from "../../src/services/admin/admin.service.js";
import {
  createRecordingEventBus,
  type RecordingEventBus,
} from "../../src/realtime/events.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

describe("closing the sockets of a session that ends", () => {
  let harness: Harness;
  let events: RecordingEventBus;

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

  const target = () =>
    createUser({ db: harness.db }, null, {
      email: "target@example.com",
      displayName: "Target",
      role: "user",
    });

  describe("the admin service, which deletes sessions behind Better Auth's back", () => {
    it("disconnects a user who is suspended", async () => {
      const { user } = await target();

      await setStatus({ db: harness.db, events }, "admin", {
        userId: user.id,
        status: "suspended",
      });

      expect(events.disconnectedUsers).toEqual([user.id]);
    });

    it("leaves a user alone who is set back to active", async () => {
      const { user } = await target();

      await setStatus({ db: harness.db, events }, "admin", {
        userId: user.id,
        status: "active",
      });

      expect(events.disconnectedUsers).toEqual([]);
    });

    it("disconnects a user whose edit takes them out of active", async () => {
      const { user } = await target();

      await editUser({ db: harness.db, events }, "admin", {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        role: "user",
        status: "suspended",
      });

      expect(events.disconnectedUsers).toEqual([user.id]);
    });

    it("disconnects a user who is deleted", async () => {
      const { user } = await target();

      await deleteUser({ db: harness.db, events }, "admin", user.id);

      expect(events.disconnectedUsers).toEqual([user.id]);
    });
  });

  describe("Better Auth, for the sessions it deletes itself", () => {
    const withHook = () => {
      const deleted: string[] = [];
      const auth = createAuth(harness.db, harness.config, {
        onSessionDeleted: (sessionId) => deleted.push(sessionId),
      });
      return { auth, deleted };
    };

    it("reports one session deleted, as a sign-out does", async () => {
      const { auth, deleted } = withHook();
      const userId = await makeUser(harness);
      const { internalAdapter } = await auth.$context;
      const session = await internalAdapter.createSession(userId);

      await internalAdapter.deleteSession(session.token);

      expect(deleted).toEqual([session.id]);
    });

    it("reports every session of a user revoked at once", async () => {
      const { auth, deleted } = withHook();
      const userId = await makeUser(harness);
      const { internalAdapter } = await auth.$context;
      const first = await internalAdapter.createSession(userId);
      const second = await internalAdapter.createSession(userId);

      await internalAdapter.deleteUserSessions(userId);

      expect(deleted.toSorted()).toEqual([first.id, second.id].toSorted());
    });
  });
});
