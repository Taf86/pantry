import { createHash } from "node:crypto";

import { INVITE_RETENTION_DAYS, type ListInvitesInput } from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { accounts } from "../../src/db/schema/accounts.js";
import { invites } from "../../src/db/schema/invites.js";
import { users } from "../../src/db/schema/users.js";
import {
  createUser,
  regenerateInvite,
  setRole,
  setStatus,
} from "../../src/services/admin/admin.service.js";
import {
  acceptInvite,
  deleteInvite,
  listInvites,
  previewInvite,
  requireInvite,
  sweepStaleInvites,
} from "../../src/services/admin/invites.service.js";
import { createHarness, type Harness } from "../helpers/harness.js";

const MS_PER_DAY = 86_400_000;
const PAGE: ListInvitesInput = {
  pagination: { pageIndex: 0, pageSize: 20 },
  sorting: [],
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

describe("onboarding without email", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const admin = () =>
    createUser({ db: harness.db }, null, {
      email: "admin@example.com",
      displayName: "Administrator",
      role: "admin",
    });

  const inviteRow = (userId: string) =>
    harness.db
      .select()
      .from(invites)
      .where(eq(invites.userId, userId))
      .limit(1);

  const statusOf = async (userId: string) => {
    const [row] = await harness.db
      .select({ status: users.status, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId));
    return row;
  };

  it("creates the user unactivated and hands out the token only once", async () => {
    const { user, invite } = await admin();

    expect(user.status).toBe("unactivated");
    expect(invite.token).toHaveLength(43);

    const [row] = await inviteRow(user.id);

    expect(row?.tokenHash).toBe(sha256(invite.token));
    expect(row?.tokenHash).not.toBe(invite.token);
    expect(row?.usedAt).toBeNull();
  });

  it("refuses two users with the same email", async () => {
    await admin();
    await expect(admin()).rejects.toThrow(TRPCError);
  });

  it("previews a valid invite", async () => {
    const { invite } = await admin();

    const preview = await previewInvite(
      { db: harness.db },
      { token: invite.token },
    );

    expect(preview.email).toBe("admin@example.com");
    expect(preview.displayName).toBe("Administrator");
    expect(preview.expiresAt).toBe(invite.expiresAt);
  });

  it("activates the account and writes the credential when the invite is accepted", async () => {
    const { user, invite } = await admin();

    const result = await acceptInvite(
      { db: harness.db, auth: harness.auth },
      { token: invite.token, password: "password-long-1" },
    );
    expect(result.email).toBe("admin@example.com");

    expect(await statusOf(user.id)).toEqual({
      status: "active",
      emailVerified: true,
    });

    const [account] = await harness.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, user.id),
          eq(accounts.providerId, "credential"),
        ),
      );

    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe("password-long-1");
  });

  it("burns the token: the second use does not go through", async () => {
    const { invite } = await admin();
    const deps = { db: harness.db, auth: harness.auth };

    await acceptInvite(deps, {
      token: invite.token,
      password: "password-long-1",
    });

    await expect(
      acceptInvite(deps, { token: invite.token, password: "other-password-1" }),
    ).rejects.toThrow(TRPCError);
  });

  it("invalidates the previous invite when a new one is issued", async () => {
    const { user, invite: first } = await admin();
    const { invite: second } = await regenerateInvite(
      { db: harness.db },
      user.id,
      user.id,
    );

    await expect(
      previewInvite({ db: harness.db }, { token: first.token }),
    ).rejects.toThrow(TRPCError);
    await expect(
      previewInvite({ db: harness.db }, { token: second.token }),
    ).resolves.toBeTruthy();
  });

  it("refuses a token that does not exist, without giving anything away", async () => {
    await expect(
      previewInvite({ db: harness.db }, { token: "made-up-token" }),
    ).rejects.toThrow(TRPCError);
  });

  it("refuses an expired invite", async () => {
    const { user, invite } = await admin();

    await harness.db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - MS_PER_DAY) })
      .where(eq(invites.userId, user.id));

    await expect(
      previewInvite({ db: harness.db }, { token: invite.token }),
    ).rejects.toThrow(TRPCError);
    await expect(
      acceptInvite(
        { db: harness.db, auth: harness.auth },
        { token: invite.token, password: "password-long-1" },
      ),
    ).rejects.toThrow(TRPCError);

    expect((await statusOf(user.id))?.status).toBe("unactivated");
  });

  it("keeps a single credential when the invite is reissued", async () => {
    const { user, invite: first } = await admin();
    const deps = { db: harness.db, auth: harness.auth };

    await acceptInvite(deps, {
      token: first.token,
      password: "password-long-1",
    });
    const [before] = await harness.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, user.id));

    const { invite: second } = await regenerateInvite(
      { db: harness.db },
      user.id,
      user.id,
    );
    await acceptInvite(deps, {
      token: second.token,
      password: "another-password-2",
    });

    const rows = await harness.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.password).not.toBe(before?.password);
  });

  it("shows in the backoffice who still has an invite open", async () => {
    const { user, invite } = await admin();

    const open = await listInvites({ db: harness.db }, PAGE);
    expect(open.rowCount).toBe(1);
    expect(open.rows[0]?.user.email).toBe("admin@example.com");
    expect(open.rows[0]?.createdBy.id).toBe(user.id);
    expect(open.rows[0]?.usedAt).toBeNull();

    await acceptInvite(
      { db: harness.db, auth: harness.auth },
      { token: invite.token, password: "password-long-1" },
    );

    const after = await listInvites({ db: harness.db }, PAGE);
    expect(after.rows[0]?.usedAt).not.toBeNull();
  });

  it("deletes an invite from the backoffice", async () => {
    const { user } = await admin();
    const [row] = await inviteRow(user.id);

    await deleteInvite({ db: harness.db }, row?.id ?? "");

    expect((await listInvites({ db: harness.db }, PAGE)).rowCount).toBe(0);
    await expect(
      requireInvite({ db: harness.db }, row?.id ?? ""),
    ).rejects.toThrow(TRPCError);
  });

  it("sweeps the invites that are spent, and keeps the ones still open", async () => {
    const { user: fresh } = await admin();
    const { user: used } = await createUser({ db: harness.db }, fresh.id, {
      email: "used@example.com",
      displayName: "Used",
      role: "user",
    });
    const { user: expired } = await createUser({ db: harness.db }, fresh.id, {
      email: "expired@example.com",
      displayName: "Expired",
      role: "user",
    });

    const longAgo = new Date(
      Date.now() - (INVITE_RETENTION_DAYS + 1) * MS_PER_DAY,
    );
    await harness.db
      .update(invites)
      .set({ usedAt: longAgo })
      .where(eq(invites.userId, used.id));
    await harness.db
      .update(invites)
      .set({ expiresAt: longAgo })
      .where(eq(invites.userId, expired.id));

    expect(await sweepStaleInvites(harness.db)).toBe(2);

    const left = await listInvites({ db: harness.db }, PAGE);
    expect(left.rowCount).toBe(1);
    expect(left.rows[0]?.user.id).toBe(fresh.id);
  });

  it("does not let a suspended user reactivate themselves with a valid invite", async () => {
    const deps = { db: harness.db };
    const { user, invite } = await createUser(deps, null, {
      email: "suspended@example.com",
      displayName: "Suspended",
      role: "user",
    });

    await setStatus(deps, "another-admin", {
      userId: user.id,
      status: "suspended",
    });

    await expect(previewInvite(deps, { token: invite.token })).rejects.toThrow(
      TRPCError,
    );
    await expect(
      acceptInvite(
        { db: harness.db, auth: harness.auth },
        { token: invite.token, password: "password-long-1" },
      ),
    ).rejects.toThrow(/suspended/i);

    expect((await statusOf(user.id))?.status).toBe("suspended");

    const left = await listInvites(deps, PAGE);
    expect(left.rows[0]?.usedAt).toBeNull();
  });

  it("does not leave the system without active admins", async () => {
    const { user } = await admin();
    const deps = { db: harness.db };

    await expect(
      setStatus(deps, "another-admin", {
        userId: user.id,
        status: "suspended",
      }),
    ).rejects.toThrow(TRPCError);
    await expect(
      setRole(deps, { userId: user.id, role: "user" }),
    ).rejects.toThrow(TRPCError);
  });

  it("does not let an admin suspend themselves", async () => {
    const { user } = await admin();

    await expect(
      setStatus({ db: harness.db }, user.id, {
        userId: user.id,
        status: "suspended",
      }),
    ).rejects.toThrow(/yourself/i);
  });
});
