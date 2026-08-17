import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import { MAX_OPEN_SIGNUP_REQUESTS } from "pantry-shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { users } from "../../src/db/schema/auth.js";
import { signupRequests } from "../../src/db/schema/signup.js";
import { loadConfig, type AppConfig } from "../../src/env.js";
import { createUser } from "../../src/services/admin.service.js";
import { previewInvite } from "../../src/services/invites.service.js";
import {
  approveSignupRequest,
  listOpenSignupRequests,
  rejectSignupRequest,
  requestSignup,
} from "../../src/services/signup.service.js";
import {
  createHarness,
  integrationEnabled,
  type Harness,
} from "../helpers/harness.js";

const configWith = (overrides: Record<string, string>): AppConfig =>
  loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DOMAIN: "test.local",
    BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnop",
    POSTGRES_HOST: process.env["POSTGRES_HOST"] ?? "localhost",
    ...overrides,
  });

describe.skipIf(!integrationEnabled)("richieste di registrazione", () => {
  let harness: Harness;
  let open: AppConfig;

  beforeAll(async () => {
    harness = await createHarness();
    open = configWith({ SIGNUP_ENABLED: "true" });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const request = (email = "aspirante@esempio.it", config: AppConfig = open) =>
    requestSignup(
      { db: harness.db, config },
      { email, displayName: "Aspirante", contact: "+39 333 1234567" },
    );

  const countRequests = async (): Promise<number> => {
    const [row] = await harness.db
      .select({ value: count() })
      .from(signupRequests);
    return row?.value ?? 0;
  };

  const admin = async (): Promise<string> => {
    const { user } = await createUser({ db: harness.db }, null, {
      email: "admin@esempio.it",
      displayName: "Amministratore",
      role: "admin",
    });
    return user.id;
  };

  it("accoda la richiesta e ne tiene aperta una sola per indirizzo", async () => {
    await expect(request()).resolves.toEqual({ ok: true });
    // Il secondo invio risponde identico al primo, ma non aggiunge niente:
    // l'indice parziale è ciò che regge l'invariante, non un controllo.
    await expect(request()).resolves.toEqual({ ok: true });

    expect(await countRequests()).toBe(1);
    expect(await listOpenSignupRequests({ db: harness.db })).toHaveLength(1);
  });

  it("non accoda chi è già utente, e non glielo dice", async () => {
    await admin();

    await expect(request("admin@esempio.it")).resolves.toEqual({ ok: true });
    expect(await countRequests()).toBe(0);
  });

  it("approvando crea un utente invitato con un link valido", async () => {
    const actorId = await admin();
    await request();

    const [pending] = await listOpenSignupRequests({ db: harness.db });
    const { user, invite } = await approveSignupRequest(
      { db: harness.db },
      actorId,
      pending!.id,
    );

    expect(user.email).toBe("aspirante@esempio.it");
    expect(user.status).toBe("invited");
    expect(user.role).toBe("user");

    const preview = await previewInvite(harness.db, invite.token);
    expect(preview.email).toBe("aspirante@esempio.it");

    // La richiesta esce dalla coda e resta legata all'utente che ha prodotto.
    expect(await listOpenSignupRequests({ db: harness.db })).toHaveLength(0);
    const [row] = await harness.db
      .select({ status: signupRequests.status, userId: signupRequests.userId })
      .from(signupRequests)
      .where(eq(signupRequests.id, pending!.id));
    expect(row?.status).toBe("approved");
    expect(row?.userId).toBe(user.id);
  });

  it("una seconda approvazione non passa e non crea un secondo utente", async () => {
    const actorId = await admin();
    await request();
    const [pending] = await listOpenSignupRequests({ db: harness.db });

    await approveSignupRequest({ db: harness.db }, actorId, pending!.id);
    await expect(
      approveSignupRequest({ db: harness.db }, actorId, pending!.id),
    ).rejects.toThrow(TRPCError);

    const [row] = await harness.db.select({ value: count() }).from(users);
    expect(row?.value).toBe(2); // l'amministratore e l'utente approvato
  });

  it("dopo un rifiuto la persona può ri-candidarsi", async () => {
    const actorId = await admin();
    await request();
    const [pending] = await listOpenSignupRequests({ db: harness.db });

    await rejectSignupRequest({ db: harness.db }, actorId, pending!.id);
    expect(await listOpenSignupRequests({ db: harness.db })).toHaveLength(0);

    await expect(request()).resolves.toEqual({ ok: true });
    expect(await listOpenSignupRequests({ db: harness.db })).toHaveLength(1);
    // Lo storico resta: il rifiuto non è stato cancellato dalla nuova richiesta.
    expect(await countRequests()).toBe(2);
  });

  it("a porta chiusa non accetta niente", async () => {
    await expect(
      request("aspirante@esempio.it", configWith({ SIGNUP_ENABLED: "false" })),
    ).rejects.toThrow(TRPCError);
    expect(await countRequests()).toBe(0);
  });

  it("con un codice configurato pretende quello giusto", async () => {
    const config = configWith({
      SIGNUP_ENABLED: "true",
      SIGNUP_CODE: "codice-di-casa",
    });
    const deps = { db: harness.db, config };
    const input = {
      email: "aspirante@esempio.it",
      displayName: "Aspirante",
      contact: "+39 333 1234567",
    };

    await expect(requestSignup(deps, input)).rejects.toThrow(TRPCError);
    await expect(
      requestSignup(deps, { ...input, code: "sbagliato" }),
    ).rejects.toThrow(TRPCError);
    expect(await countRequests()).toBe(0);

    await expect(
      requestSignup(deps, { ...input, code: "codice-di-casa" }),
    ).resolves.toEqual({ ok: true });
  });

  it("smette di accodare oltre il tetto delle richieste aperte", async () => {
    await harness.db.insert(signupRequests).values(
      Array.from({ length: MAX_OPEN_SIGNUP_REQUESTS }, (_unused, index) => ({
        id: randomUUID(),
        email: `aspirante-${index}@esempio.it`,
        displayName: `Aspirante ${index}`,
        contact: "ignoto",
      })),
    );

    await expect(request("uno-in-piu@esempio.it")).rejects.toThrow(
      /Troppe richieste/,
    );
  });
});
