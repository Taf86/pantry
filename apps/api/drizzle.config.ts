import { defineConfig } from "drizzle-kit";
import { buildDbUrl, rawDbEnvSchema } from "./src/config/db.js";
import { parseEnvOrThrow } from "./src/config/parse-env.js";

const url = buildDbUrl(parseEnvOrThrow(rawDbEnvSchema, process.env));
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
