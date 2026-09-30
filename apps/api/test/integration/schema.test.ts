import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { lists } from "../../src/db/schema/lists.js";
import { violatedConstraint } from "../helpers/constraints.js";
import { createHarness, makeUser, type Harness } from "../helpers/harness.js";

describe("the phase 2 schema", () => {
  let harness: Harness;
  let userId: string;
  let listId: string;

  const makeList = async (): Promise<string> => {
    const id = crypto.randomUUID();
    await harness.db
      .insert(lists)
      .values({ id, name: "Spesa", createdBy: userId });
    return id;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    userId = await makeUser(harness, { status: "active" });
    listId = await makeList();
  });

  describe("membership", () => {
    it("rejects a permission mask carrying an undefined bit", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, permissions)
              VALUES (${listId}, ${userId}, ${1 | (1 << 6)})`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });

    it("rejects a permission mask without Read", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, permissions)
              VALUES (${listId}, ${userId}, ${2 | 4 | 8})`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });

    it("rejects an empty permission mask", async () => {
      expect(
        await violatedConstraint(() =>
          harness.db.execute(
            sql`INSERT INTO list_members (list_id, user_id, permissions)
              VALUES (${listId}, ${userId}, 0)`,
          ),
        ),
      ).toBe("list_members_permissions_check");
    });
  });
});
