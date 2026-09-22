import {
  MAX_OPEN_REQUESTS,
  MAX_OPEN_REQUESTS_PER_IP,
  REQUEST_PENDING_TTL_DAYS,
  REQUEST_RETENTION_DAYS,
  type ListRequestsInput,
} from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { requests } from "../../src/db/schema/requests.js";
import { users } from "../../src/db/schema/users.js";
import {
  createUser,
  setStatus,
} from "../../src/services/admin/admin.service.js";
import { previewInvite } from "../../src/services/admin/invites.service.js";
import {
  approveRequest,
  createRequest,
  listRequests,
  rejectRequest,
  requireRequest,
  sweepDecidedRequests,
  sweepStalePendingRequests,
} from "../../src/services/admin/requests.service.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

const MS_PER_DAY = 86_400_000;
const PAGE: ListRequestsInput = {
  pagination: { pageIndex: 0, pageSize: 20 },
  sorting: [],
  filters: {},
};

describe("requests", () => {
  let harness: Harness;
  let admin: string;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    admin = await makeUser(harness, {
      email: "admin@example.com",
      displayName: "Administrator",
      role: "admin",
    });
  });

  const deps = () => ({ db: harness.db });

  const signup = (email = "newcomer@example.com") =>
    createRequest(deps(), {
      type: "signup",
      email,
      displayName: "Newcomer",
    });

  const reset = (email: string) =>
    createRequest(deps(), { type: "reset_password", email });

  it("queues a signup with what the account will need", async () => {
    const { id } = await signup();
    const request = await requireRequest(deps(), id);

    expect(request.type).toBe("signup");
    expect(request.status).toBe("pending");
    expect(request.email).toBe("newcomer@example.com");
    expect(request.displayName).toBe("Newcomer");
    expect(request.user).toBeNull();
    expect(request.decidedBy).toBeNull();
    expect(request.decidedAt).toBeNull();
  });

  it("keeps one open request per address, whatever it asks for", async () => {
    const first = await signup();
    const again = await signup();
    const other = await reset("newcomer@example.com");

    expect(again.id).toBe(first.id);
    expect(other.id).toBe(first.id);
    expect((await listRequests(deps(), PAGE)).rowCount).toBe(1);
  });

  it("queues again once the previous one has been decided", async () => {
    const { id } = await signup();
    await rejectRequest(deps(), admin, id);

    const second = await signup();

    expect(second.id).not.toBe(id);
    expect((await listRequests(deps(), PAGE)).rowCount).toBe(2);
  });

  it("stops accepting when the queue is full", async () => {
    await harness.db.insert(requests).values(
      Array.from({ length: MAX_OPEN_REQUESTS }, (_, index) => ({
        id: crypto.randomUUID(),
        type: "signup" as const,
        email: `queued-${index}@example.com`,
        displayName: `Queued ${index}`,
      })),
    );

    await expect(signup()).rejects.toThrow(/too many/i);
  });

  it("creates the account and hands out a link when a signup is approved", async () => {
    const { id } = await signup();

    const { request, user, invite } = await approveRequest(deps(), admin, id);

    expect(user.email).toBe("newcomer@example.com");
    expect(user.displayName).toBe("Newcomer");
    expect(user.status).toBe("unactivated");
    expect(user.role).toBe("user");

    expect(invite.userId).toBe(user.id);
    await expect(
      previewInvite(deps(), { token: invite.token }),
    ).resolves.toMatchObject({ email: "newcomer@example.com" });

    expect(request.status).toBe("approved");
    expect(request.user?.id).toBe(user.id);
    expect(request.decidedBy?.id).toBe(admin);
    expect(request.decidedAt).not.toBeNull();
  });

  it("does not approve the same request twice", async () => {
    const { id } = await signup();
    await approveRequest(deps(), admin, id);

    await expect(approveRequest(deps(), admin, id)).rejects.toThrow(
      /already decided/i,
    );
    await expect(rejectRequest(deps(), admin, id)).rejects.toThrow(
      /already decided/i,
    );
  });

  it("refuses a signup for an address that already has an account", async () => {
    await makeUser(harness, { email: "taken@example.com" });
    const { id } = await createRequest(deps(), {
      type: "signup",
      email: "taken@example.com",
      displayName: "Impostor",
    });

    await expect(approveRequest(deps(), admin, id)).rejects.toThrow(TRPCError);

    expect((await requireRequest(deps(), id)).status).toBe("pending");
  });

  it("issues a new link and burns the old one when a reset is approved", async () => {
    const { user, invite: first } = await createUser(deps(), admin, {
      email: "forgetful@example.com",
      displayName: "Forgetful",
      role: "user",
    });
    const { id } = await reset("forgetful@example.com");

    const approved = await approveRequest(deps(), admin, id);

    expect(approved.user.id).toBe(user.id);
    expect(approved.invite.token).not.toBe(first.token);
    await expect(previewInvite(deps(), { token: first.token })).rejects.toThrow(
      TRPCError,
    );
    await expect(
      previewInvite(deps(), { token: approved.invite.token }),
    ).resolves.toBeTruthy();

    expect(approved.request.user?.id).toBe(user.id);
  });

  it("leaves the request open when a reset points nowhere", async () => {
    const { id } = await reset("ghost@example.com");

    await expect(approveRequest(deps(), admin, id)).rejects.toThrow(
      /no account/i,
    );

    const request = await requireRequest(deps(), id);
    expect(request.status).toBe("pending");
    expect(request.decidedAt).toBeNull();
  });

  it("does not reset the password of a suspended account", async () => {
    const suspended = await makeUser(harness, {
      email: "suspended@example.com",
    });
    await setStatus(deps(), admin, {
      userId: suspended,
      status: "suspended",
    });
    const { id } = await reset("suspended@example.com");

    await expect(approveRequest(deps(), admin, id)).rejects.toThrow(
      /suspended/i,
    );
    expect((await requireRequest(deps(), id)).status).toBe("pending");
  });

  it("records who turned a request down, and creates nothing", async () => {
    const { id } = await signup();

    const rejected = await rejectRequest(deps(), admin, id);

    expect(rejected.status).toBe("rejected");
    expect(rejected.decidedBy?.id).toBe(admin);
    expect(rejected.user).toBeNull();

    const [created] = await harness.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "newcomer@example.com"));
    expect(created).toBeUndefined();
  });

  it("refuses a request that does not exist", async () => {
    await expect(requireRequest(deps(), crypto.randomUUID())).rejects.toThrow(
      TRPCError,
    );
    await expect(
      approveRequest(deps(), admin, crypto.randomUUID()),
    ).rejects.toThrow(TRPCError);
  });

  it("filters the backoffice list by type and status", async () => {
    const { id } = await signup();
    await reset("forgetful@example.com");
    await rejectRequest(deps(), admin, id);

    const pending = await listRequests(deps(), {
      ...PAGE,
      filters: { status: ["pending"] },
    });
    expect(pending.rowCount).toBe(1);
    expect(pending.rows[0]?.type).toBe("reset_password");

    const signups = await listRequests(deps(), {
      ...PAGE,
      filters: { type: ["signup"] },
    });
    expect(signups.rowCount).toBe(1);
    expect(signups.rows[0]?.status).toBe("rejected");

    const byEmail = await listRequests(deps(), {
      ...PAGE,
      filters: { email: "forgetful" },
    });
    expect(byEmail.rowCount).toBe(1);
  });

  it("sweeps the requests that have been decided, and keeps the open ones", async () => {
    const { id: decided } = await signup();
    await rejectRequest(deps(), admin, decided);
    await reset("forgetful@example.com");

    expect(await sweepDecidedRequests(harness.db)).toBe(0);

    await harness.db
      .update(requests)
      .set({
        decidedAt: new Date(
          Date.now() - (REQUEST_RETENTION_DAYS + 1) * MS_PER_DAY,
        ),
      })
      .where(eq(requests.id, decided));

    expect(await sweepDecidedRequests(harness.db)).toBe(1);

    const left = await listRequests(deps(), PAGE);
    expect(left.rowCount).toBe(1);
    expect(left.rows[0]?.status).toBe("pending");
  });

  describe("abuse controls", () => {
    const fromIp = (hash: string) => ({ db: harness.db, requesterHash: hash });

    it("caps the open requests a single caller may hold", async () => {
      for (let i = 0; i < MAX_OPEN_REQUESTS_PER_IP; i += 1) {
        await createRequest(fromIp("caller-a"), {
          type: "signup",
          email: `queued-${String(i)}@example.com`,
          displayName: "Queued",
        });
      }

      await expect(
        createRequest(fromIp("caller-a"), {
          type: "signup",
          email: "one-too-many@example.com",
          displayName: "Queued",
        }),
      ).rejects.toThrow(/too many/i);
    });

    it("lets another caller through while one is capped", async () => {
      for (let i = 0; i < MAX_OPEN_REQUESTS_PER_IP; i += 1) {
        await createRequest(fromIp("caller-a"), {
          type: "signup",
          email: `queued-${String(i)}@example.com`,
          displayName: "Queued",
        });
      }

      const { id } = await createRequest(fromIp("caller-b"), {
        type: "signup",
        email: "someone-else@example.com",
        displayName: "Someone",
      });

      expect(id).toBeTruthy();
    });

    it("frees a caller's quota once their requests are decided", async () => {
      const held: string[] = [];
      for (let i = 0; i < MAX_OPEN_REQUESTS_PER_IP; i += 1) {
        const { id } = await createRequest(fromIp("caller-a"), {
          type: "signup",
          email: `queued-${String(i)}@example.com`,
          displayName: "Queued",
        });
        held.push(id);
      }
      await rejectRequest(deps(), admin, held[0] ?? "");

      const { id } = await createRequest(fromIp("caller-a"), {
        type: "signup",
        email: "next@example.com",
        displayName: "Next",
      });

      expect(id).toBeTruthy();
    });

    it("expires a request nobody answered, so the queue can drain", async () => {
      const { id } = await signup();
      await reset("recent@example.com");

      expect(await sweepStalePendingRequests(harness.db)).toBe(0);

      await harness.db
        .update(requests)
        .set({
          createdAt: new Date(
            Date.now() - (REQUEST_PENDING_TTL_DAYS + 1) * MS_PER_DAY,
          ),
        })
        .where(eq(requests.id, id));

      expect(await sweepStalePendingRequests(harness.db)).toBe(1);

      const expired = await requireRequest(deps(), id);
      expect(expired.status).toBe("rejected");
      // A null decider is what tells an expiry apart from a real refusal,
      // which is why no new status was needed.
      expect(expired.decidedBy).toBeNull();
      expect(expired.decidedAt).not.toBeNull();
    });

    it("frees the address again once its request has expired", async () => {
      const { id } = await signup();
      await harness.db
        .update(requests)
        .set({
          createdAt: new Date(
            Date.now() - (REQUEST_PENDING_TTL_DAYS + 1) * MS_PER_DAY,
          ),
        })
        .where(eq(requests.id, id));
      await sweepStalePendingRequests(harness.db);

      const second = await signup();

      expect(second.id).not.toBe(id);
    });
  });

  describe("admin notification", () => {
    const withNotifier = () => {
      const requestQueued = vi.fn();
      return {
        requestQueued,
        deps: {
          db: harness.db,
          notifier: { requestQueued, stop: () => Promise.resolve() },
        },
      };
    };

    it("notifies once for a request that was actually queued", async () => {
      const { requestQueued, deps: withSpy } = withNotifier();

      await createRequest(withSpy, {
        type: "signup",
        email: "newcomer@example.com",
        displayName: "Newcomer",
      });

      expect(requestQueued).toHaveBeenCalledTimes(1);
    });

    it("stays silent on a repeat of an address already in the queue", async () => {
      const { requestQueued, deps: withSpy } = withNotifier();

      await createRequest(withSpy, {
        type: "signup",
        email: "newcomer@example.com",
        displayName: "Newcomer",
      });
      await createRequest(withSpy, {
        type: "signup",
        email: "newcomer@example.com",
        displayName: "Newcomer",
      });
      await createRequest(withSpy, {
        type: "reset_password",
        email: "newcomer@example.com",
      });

      expect(requestQueued).toHaveBeenCalledTimes(1);
    });

    it("stays silent when the queue refuses the request", async () => {
      await harness.db.insert(requests).values(
        Array.from({ length: MAX_OPEN_REQUESTS }, (_, index) => ({
          id: crypto.randomUUID(),
          type: "signup" as const,
          email: `queued-${String(index)}@example.com`,
          displayName: `Queued ${String(index)}`,
        })),
      );
      const { requestQueued, deps: withSpy } = withNotifier();

      await expect(
        createRequest(withSpy, {
          type: "signup",
          email: "newcomer@example.com",
          displayName: "Newcomer",
        }),
      ).rejects.toThrow(/too many/i);

      expect(requestQueued).not.toHaveBeenCalled();
    });

    it("still stores the request when notifying throws", async () => {
      const requestQueued = vi.fn(() => {
        throw new Error("notifier exploded");
      });

      const { id } = await createRequest(
        {
          db: harness.db,
          notifier: { requestQueued, stop: () => Promise.resolve() },
        },
        {
          type: "signup",
          email: "newcomer@example.com",
          displayName: "Newcomer",
        },
      );

      expect((await requireRequest(deps(), id)).status).toBe("pending");
    });
  });
});
