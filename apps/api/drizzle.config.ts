import { defineConfig } from "drizzle-kit";
import { buildDbUrl, rawDbEnvSchema } from "./src/config/db.js";

const parsed = rawDbEnvSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Configurazione non valida:\n${details}`);
}

const url = buildDbUrl(parsed.data);
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
