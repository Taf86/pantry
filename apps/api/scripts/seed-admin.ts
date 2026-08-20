import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { createUserInputSchema } from "@pantry/shared";
import { createDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { users } from "../src/db/schema/users.js";
import { loadConfig } from "../src/config/env.js";
import {
  createUser,
  regenerateInvite,
  setRole,
} from "../src/services/admin/admin.service.js";

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
    },
  });

  const parsed = createUserInputSchema.safeParse({
    email: values.email,
    displayName: values.name,
    role: "admin",
  });

  if (!parsed.success) {
    process.stderr.write(
      "Usage: seed:admin --email <email> --name <nome>\n" +
        parsed.error.issues.map((issue) => `  ${issue.message}`).join("\n") +
        "\n",
    );
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const handle = createDatabase(config);

  try {
    await runMigrations(handle.db);
    const deps = { db: handle.db };

    const [existing] = await handle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    const result = existing
      ? await (async () => {
          await setRole(deps, { userId: existing.id, role: "admin" });
          return regenerateInvite(deps, existing.id, existing.id);
        })()
      : await createUser(deps, null, parsed.data);

    process.stdout.write(
      [
        `Admin: ${result.user.email}`,
        `Activation link (expiring at ${new Date(result.invite.expiresAt).toLocaleString("it-IT")}):`,
        `${config.appUrl}/invite/${result.invite.token}`,
        "",
        "Token is not retrievable, use it now or store it",
        "",
      ].join("\n"),
    );
  } finally {
    await handle.close();
  }
};

await main();
