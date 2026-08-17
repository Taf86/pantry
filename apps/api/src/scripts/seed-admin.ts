import { parseArgs } from "node:util";

import { eq } from "drizzle-orm";
import { createUserInput } from "pantry-shared";

import { loadLocalEnv } from "../config/dotenv.js";
import { createDatabase } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { users } from "../db/schema/auth.js";
import { loadConfig } from "../env.js";
import {
  createUser,
  regenerateInvite,
  setRole,
} from "../services/admin.service.js";

/**
 * Il primo amministratore.
 *
 * Si esegue una volta sola, a mano, sulla macchina: in un sistema dove ogni
 * account ha bisogno di un amministratore che lo crei o approvi la richiesta,
 * è l'unico modo di far entrare il primo. Da lì in poi gli utenti si creano —
 * o si approvano — dal backoffice.
 *
 *   pnpm --filter pantry-api seed:admin -- --email a@b.it --name "Nome"
 */
const main = async (): Promise<void> => {
  loadLocalEnv();

  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
    },
  });

  const parsed = createUserInput.safeParse({
    email: values.email ?? process.env["SEED_ADMIN_EMAIL"],
    displayName: values.name ?? process.env["SEED_ADMIN_NAME"],
    role: "admin",
  });

  if (!parsed.success) {
    process.stderr.write(
      "Uso: seed:admin --email <email> --name <nome>\n" +
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

    // Rieseguire lo script su un utente esistente non deve fallire: è il modo
    // previsto per recuperare l'accesso se il primo link va perso.
    const result = existing
      ? await (async () => {
          await setRole(deps, existing.id, existing.id, "admin");
          return regenerateInvite(deps, existing.id, existing.id);
        })()
      : await createUser(deps, null, parsed.data);

    process.stdout.write(
      [
        `Amministratore: ${result.user.email}`,
        `Link di attivazione (valido fino al ${new Date(result.invite.expiresAt).toLocaleString("it-IT")}):`,
        `${config.appUrl}/invite/${result.invite.token}`,
        "",
        "Il token non è recuperabile: consegnalo ora o rigeneralo.",
        "",
      ].join("\n"),
    );
  } finally {
    await handle.close();
  }
};

await main();
