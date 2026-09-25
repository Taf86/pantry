import {
  SHOPPING_LEASE_TTL_MS,
  SessionEndReason,
  sessionConflictSchema,
  type SessionConflict,
} from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listMembers } from "../../src/db/schema/list-members.js";
import { lists } from "../../src/db/schema/lists.js";
import { shoppingSessions } from "../../src/db/schema/shopping-sessions.js";
import { deleteList } from "../../src/services/lists/lists.service.js";
import {
  activeSession,
  claimSession,
  heartbeatSession,
  releaseSession,
  sweepEndedShoppingSessions,
  sweepExpiredShoppingSessions,
} from "../../src/services/shopping/sessions.service.js";
import {
  createRecordingEventBus,
  type RecordingEventBus,
} from "../../src/realtime/events.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MINUTE = 60_000;

/** Ages the lease so it reads as expired, without waiting three hours. */
const expireLease = (harness: Harness, sessionId: string, byMs = MINUTE) =>
  harness.db
    .update(shoppingSessions)
    .set({ expiresAt: new Date(Date.now() - byMs) })
    .where(eq(shoppingSessions.id, sessionId));

describe("the shopping lease", () => {
  let harness: Harness;
  let events: RecordingEventBus;
  let marco: string;
  let anna: string;
  let listId: string;

  const deps = () => ({ db: harness.db, events });

  /**
   * Parses the conflict off the error rather than casting it. The payload
   * reaches the client as data.conflict and is parsed back with this very
   * schema, so validating it here is what proves the contract holds.
   */
  const conflictOf = async (
    run: () => Promise<unknown>,
  ): Promise<{ code: string; conflict: SessionConflict | null } | null> => {
    try {
      await run();
      return null;
    } catch (error) {
      if (!(error instanceof TRPCError)) throw error;
      const parsed = sessionConflictSchema.safeParse(error.cause);
      return {
        code: error.code,
        conflict: parsed.success ? parsed.data : null,
      };
    }
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
    marco = await makeUser(harness, { status: "active" });
    anna = await makeUser(harness, { status: "active" });
    listId = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id: listId, name: "Spesa", createdBy: marco });
    await harness.db.insert(listMembers).values([
      { listId, userId: marco, permissions: 15 },
      { listId, userId: anna, permissions: 15 },
    ]);
  });

  describe("claiming", () => {
    it("grants the lease to the first caller", async () => {
      const session = await claimSession(deps(), marco, { listId });

      expect(session.holder.id).toBe(marco);
      expect(session.endedAt).toBeNull();
      expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
    });

    it("refuses a second caller with a conflict naming who holds it", async () => {
      await claimSession(deps(), marco, { listId });

      const failure = await conflictOf(() =>
        claimSession(deps(), anna, { listId }),
      );

      expect(failure?.code).toBe("CONFLICT");
      expect(failure?.conflict?.code).toBe("session_held");
      expect(failure?.conflict?.session?.holder.id).toBe(marco);
    });

    it("renews instead of conflicting when the holder claims again", async () => {
      const first = await claimSession(deps(), marco, { listId });
      await expireLease(harness, first.id);

      const again = await claimSession(deps(), marco, { listId });

      expect(again.id).toBe(first.id);
      expect(Date.parse(again.expiresAt)).toBeGreaterThan(Date.now());
    });

    it("refuses to take over a lease that is still alive", async () => {
      await claimSession(deps(), marco, { listId });

      expect(
        (await conflictOf(() => claimSession(deps(), anna, { listId })))?.code,
      ).toBe("CONFLICT");
    });

    it("takes over an expired lease in a single transaction", async () => {
      const first = await claimSession(deps(), marco, { listId });
      await expireLease(harness, first.id);

      const second = await claimSession(deps(), anna, { listId });

      expect(second.holder.id).toBe(anna);
      expect(second.id).not.toBe(first.id);

      const [closed] = await harness.db
        .select()
        .from(shoppingSessions)
        .where(eq(shoppingSessions.id, first.id));
      expect(closed?.endReason).toBe(SessionEndReason.taken_over);
    });

    it("never leaves two sessions open on one list", async () => {
      const first = await claimSession(deps(), marco, { listId });
      await expireLease(harness, first.id);
      await claimSession(deps(), anna, { listId });

      const open = (await harness.db.select().from(shoppingSessions)).filter(
        (row) => row.endedAt === null,
      );
      expect(open).toHaveLength(1);
    });
  });

  describe("the heartbeat", () => {
    it("pushes the expiry out", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await expireLease(harness, session.id);

      const renewed = await heartbeatSession(deps(), marco, {
        listId,
        sessionId: session.id,
      });

      expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.now());
    });

    it("renews a lease that expired while the holder was offline", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await expireLease(harness, session.id, 20 * MINUTE);

      // Twenty minutes in a dead spot must not cost the shopper their turn at
      // the till, as long as nobody actually took over.
      await expect(
        heartbeatSession(deps(), marco, { listId, sessionId: session.id }),
      ).resolves.toMatchObject({ id: session.id });
    });

    it("refuses the heartbeat of a holder whose lease was taken over", async () => {
      const first = await claimSession(deps(), marco, { listId });
      await expireLease(harness, first.id);
      await claimSession(deps(), anna, { listId });

      const failure = await conflictOf(() =>
        heartbeatSession(deps(), marco, { listId, sessionId: first.id }),
      );

      expect(failure?.code).toBe("CONFLICT");
      expect(failure?.conflict?.code).toBe("session_lost");
      expect(failure?.conflict?.session?.holder.id).toBe(anna);
    });

    it("refuses a heartbeat for somebody else's session", async () => {
      const session = await claimSession(deps(), marco, { listId });

      expect(
        (
          await conflictOf(() =>
            heartbeatSession(deps(), anna, { listId, sessionId: session.id }),
          )
        )?.code,
      ).toBe("CONFLICT");
    });
  });

  describe("releasing", () => {
    it("ends the session once and ignores a second release", async () => {
      const session = await claimSession(deps(), marco, { listId });
      const input = { listId, sessionId: session.id, completed: false };

      expect(await releaseSession(deps(), marco, input)).not.toBeNull();
      expect(await releaseSession(deps(), marco, input)).toBeNull();
    });

    it("records whether the run was finished or abandoned", async () => {
      const session = await claimSession(deps(), marco, { listId });
      const ended = await releaseSession(deps(), marco, {
        listId,
        sessionId: session.id,
        completed: true,
      });

      expect(ended?.endReason).toBe(SessionEndReason.completed);
    });

    it("frees the list for somebody else straight away", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await releaseSession(deps(), marco, {
        listId,
        sessionId: session.id,
        completed: true,
      });

      await expect(
        claimSession(deps(), anna, { listId }),
      ).resolves.toMatchObject({
        holder: { id: anna },
      });
    });

    it("leaves no lease behind when the list is deleted", async () => {
      await claimSession(deps(), marco, { listId });
      await deleteList(deps(), marco, {
        mutationId: crypto.randomUUID(),
        listId,
      });

      // The cascade takes it: nothing has to remember to end it, and the
      // partial unique index cannot be left holding a slot for a list nobody
      // can open any more.
      expect(await harness.db.select().from(shoppingSessions)).toEqual([]);
    });
  });

  describe("reading", () => {
    it("reports nobody on a list nobody took", async () => {
      expect(await activeSession(harness.db, listId)).toBeNull();
    });

    it("reports the holder while the lease stands", async () => {
      await claimSession(deps(), marco, { listId });

      expect(await activeSession(harness.db, listId)).toMatchObject({
        holder: { id: marco },
      });
    });

    it("keeps reporting the holder after expiry, so the client can name them", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await expireLease(harness, session.id);

      // Expiry is not an ending. The client derives "expired" from expiresAt
      // and still has a name to put in the takeover dialog.
      expect(await activeSession(harness.db, listId)).toMatchObject({
        holder: { id: marco },
        endedAt: null,
      });
    });
  });

  describe("the sweepers", () => {
    it("leaves a merely expired lease alone", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await expireLease(harness, session.id, MINUTE);

      expect(await sweepExpiredShoppingSessions(harness.db)).toBe(0);
    });

    it("closes a lease abandoned for a full further TTL", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await expireLease(harness, session.id, SHOPPING_LEASE_TTL_MS + MINUTE);

      expect(await sweepExpiredShoppingSessions(harness.db)).toBe(1);
      expect(await activeSession(harness.db, listId)).toBeNull();
    });

    it("lets the list be taken again once the sweeper has closed the old one", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await expireLease(harness, session.id, SHOPPING_LEASE_TTL_MS + MINUTE);
      await sweepExpiredShoppingSessions(harness.db);

      await expect(
        claimSession(deps(), anna, { listId }),
      ).resolves.toMatchObject({
        holder: { id: anna },
      });
    });

    it("keeps an ended session until its retention runs out", async () => {
      const session = await claimSession(deps(), marco, { listId });
      await releaseSession(deps(), marco, {
        listId,
        sessionId: session.id,
        completed: true,
      });

      expect(await sweepEndedShoppingSessions(harness.db)).toBe(0);
    });
  });

  describe("notifications", () => {
    it("announces the ended session before the one that replaced it", async () => {
      const first = await claimSession(deps(), marco, { listId });
      await expireLease(harness, first.id);
      events.reset();

      await claimSession(deps(), anna, { listId });

      expect(events.events.map((e) => e.type)).toEqual([
        "session.ended",
        "session.started",
      ]);
    });

    it("says nothing when a release changed nothing", async () => {
      const session = await claimSession(deps(), marco, { listId });
      const input = { listId, sessionId: session.id, completed: false };
      await releaseSession(deps(), marco, input);
      events.reset();

      await releaseSession(deps(), marco, input);

      expect(events.events).toEqual([]);
    });
  });
});
