import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuth } from "../../src/auth/auth.js";
import { accounts, invites, users } from "../../src/db/schema/auth.js";
import { loadConfig } from "../../src/env.js";
import {
  createUser,
  listUsers,
  regenerateInvite,
  setRole,
  setStatus,
} from "../../src/services/admin.service.js";
import {
  acceptInvite,
  hashToken,
  previewInvite,
} from "../../src/services/invites.service.js";
import {
  createHarness,
  integrationEnabled,
  type Harness,
} from "../helpers/harness.js";

describe.skipIf(!integrationEnabled)("onboarding senza email", () => {
  let harness: Harness;
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    harness = await createHarness();
    auth = createAuth(
      harness.db,
      loadConfig({
        ...process.env,
        NODE_ENV: "test",
        DOMAIN: "test.local",
        BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnop",
        POSTGRES_HOST: process.env["POSTGRES_HOST"] ?? "localhost",
      }),
    );
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const admin = () =>
    createUser({ db: harness.db }, null, {
      email: "admin@esempio.it",
      displayName: "Amministratore",
      role: "admin",
    });

  it("crea l'utente in stato 'invited' e restituisce il token una sola volta", async () => {
    const { user, invite } = await admin();

    expect(user.status).toBe("invited");
    expect(invite.token).toHaveLength(43);

    const [row] = await harness.db
      .select({ tokenHash: invites.tokenHash })
      .from(invites)
      .where(eq(invites.userId, user.id));

    // In database non c'è mai il token, solo il suo SHA-256.
    expect(row?.tokenHash).toBe(hashToken(invite.token));
    expect(row?.tokenHash).not.toBe(invite.token);
  });

  it("rifiuta due utenti con la stessa email", async () => {
    await admin();
    await expect(admin()).rejects.toThrow(TRPCError);
  });

  it("mostra l'anteprima di un invito valido", async () => {
    const { invite } = await admin();
    const preview = await previewInvite(harness.db, invite.token);
    expect(preview.email).toBe("admin@esempio.it");
  });

  it("attiva l'account e scrive la credenziale accettando l'invito", async () => {
    const { user, invite } = await admin();

    await acceptInvite(
      { db: harness.db, auth },
      { token: invite.token, password: "password-lunga-1" },
    );

    const [refreshed] = await harness.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, user.id));
    expect(refreshed?.status).toBe("active");

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
    expect(account?.password).not.toBe("password-lunga-1");
  });

  it("brucia il token: il secondo uso non passa", async () => {
    const { invite } = await admin();
    const deps = { db: harness.db, auth };

    await acceptInvite(deps, {
      token: invite.token,
      password: "password-lunga-1",
    });

    await expect(
      acceptInvite(deps, { token: invite.token, password: "altra-password-1" }),
    ).rejects.toThrow(TRPCError);
  });

  it("rigenerando un invito invalida quello precedente", async () => {
    const { user, invite: first } = await admin();
    const { invite: second } = await regenerateInvite(
      { db: harness.db },
      user.id,
      user.id,
    );

    await expect(previewInvite(harness.db, first.token)).rejects.toThrow(
      TRPCError,
    );
    await expect(previewInvite(harness.db, second.token)).resolves.toBeTruthy();
  });

  it("rifiuta un token inesistente senza rivelare nulla", async () => {
    await expect(previewInvite(harness.db, "token-inventato")).rejects.toThrow(
      TRPCError,
    );
  });

  it("segnala nel backoffice chi ha un invito ancora aperto", async () => {
    const { user, invite } = await admin();
    expect((await listUsers({ db: harness.db }))[0]?.hasPendingInvite).toBe(
      true,
    );

    await acceptInvite(
      { db: harness.db, auth },
      { token: invite.token, password: "password-lunga-1" },
    );

    const after = await listUsers({ db: harness.db });
    expect(after.find((entry) => entry.id === user.id)?.hasPendingInvite).toBe(
      false,
    );
  });

  it("non lascia il sistema senza amministratori attivi", async () => {
    const { user } = await admin();
    const deps = { db: harness.db };

    await expect(
      setStatus(deps, "altro-admin", user.id, "suspended"),
    ).rejects.toThrow(TRPCError);
    await expect(setRole(deps, user.id, user.id, "user")).rejects.toThrow(
      TRPCError,
    );
  });

  it("un amministratore non può sospendere sé stesso", async () => {
    const { user } = await admin();
    await expect(
      setStatus({ db: harness.db }, user.id, user.id, "suspended"),
    ).rejects.toThrow(/te stesso/);
  });
});
