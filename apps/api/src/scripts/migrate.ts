import { createDatabase } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { loadConfig } from "../env.js";

const main = async (): Promise<void> => {
  const handle = createDatabase(loadConfig());
  try {
    await runMigrations(handle.db);
    process.stdout.write("Migrazioni applicate.\n");
  } finally {
    await handle.close();
  }
};

await main();
