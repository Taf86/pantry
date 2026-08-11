import { TRPCError } from "@trpc/server";
import { Permission, Role, uuidv7 } from "pantry-shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listMembers, lists } from "../../src/db/schema/lists.js";
import { eq } from "drizzle-orm";
import {
  assertListPermissions,
  getListMembership,
  requireListPermission,
} from "../../src/services/membership.js";
import { createList, shareList } from "../../src/services/lists.service.js";
import {
  createHarness,
  integrationEnabled,
  makeList,
  makeUser,
  type Harness,
} from "../helpers/harness.js";

describe.skipIf(!integrationEnabled)("permessi", () => {
  let harness: Harness;
  let owner: string;
  let shopper: string;
  let estraneo: string;
  let listId: string;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    owner = await makeUser(harness);
    shopper = await makeUser(harness);
    estraneo = await makeUser(harness);
    listId = await makeList(harness, owner);

    await harness.db
      .insert(listMembers)
      .values({ listId, userId: shopper, permissions: Role.Shopper });
  });

  it("nega tutto a chi non è membro", async () => {
    expect(await getListMembership(harness.db, listId, estraneo)).toBeNull();
    await expect(
      requireListPermission(harness.db, listId, estraneo, Permission.Read),
    ).rejects.toThrow(TRPCError);
  });

  it("uno Shopper legge e spunta ma non modifica", async () => {
    await expect(
      requireListPermission(harness.db, listId, shopper, Permission.Shop),
    ).resolves.toBe(Role.Shopper);
    await expect(
      requireListPermission(harness.db, listId, shopper, Permission.Write),
    ).rejects.toThrow(TRPCError);
  });

  it("una lista cancellata non concede più permessi a nessuno", async () => {
    await harness.db
      .update(lists)
      .set({ deletedAt: new Date() })
      .where(eq(lists.id, listId));

    expect(await getListMembership(harness.db, listId, owner)).toBeNull();
  });

  it("il controllo in blocco fallisce se anche una sola lista non è autorizzata", async () => {
    const altra = await makeList(harness, estraneo);

    await expect(
      assertListPermissions(
        harness.db,
        [listId, altra],
        shopper,
        Permission.Shop,
      ),
    ).rejects.toThrow(TRPCError);
  });

  it("il controllo in blocco passa quando tutte le liste lo consentono", async () => {
    const seconda = await makeList(harness, shopper, Role.Shopper);
    await expect(
      assertListPermissions(
        harness.db,
        [listId, seconda],
        shopper,
        Permission.Shop,
      ),
    ).resolves.toBeUndefined();
  });

  it("chi crea una lista ne diventa proprietario", async () => {
    const created = await createList(harness.deps, owner, {
      mutationId: uuidv7(),
      id: uuidv7(),
      name: "Nuova",
    });

    expect(created.permissions).toBe(Role.Owner);
    expect(await getListMembership(harness.db, created.id, owner)).toEqual({
      permissions: Role.Owner,
    });
  });

  it("il proprietario non può essere retrocesso sotto Manage", async () => {
    await expect(
      shareList(harness.deps, owner, Role.Owner, {
        mutationId: uuidv7(),
        listId,
        userId: owner,
        permissions: Role.Viewer,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("la condivisione aggiorna i permessi di un membro esistente", async () => {
    const detail = await shareList(harness.deps, owner, Role.Owner, {
      mutationId: uuidv7(),
      listId,
      userId: shopper,
      permissions: Role.Editor,
    });

    const member = detail.members.find((entry) => entry.user.id === shopper);
    expect(member?.permissions).toBe(Role.Editor);
  });
});
