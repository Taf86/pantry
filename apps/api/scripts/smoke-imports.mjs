import { access, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const SKIP = new Set(["main.ts"]);

const walk = async (dir) => {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
      found.push(path);
  }
  return found;
};

// Modules are derived from src/ so stale leftovers in dist/ (tsc never cleans outDir) are ignored.
const main = async () => {
  const sources = (await walk(SRC))
    .map((file) => relative(SRC, file).replaceAll("\\", "/"))
    .filter((file) => !SKIP.has(file));

  const modules = sources.map((file) =>
    join(DIST, file.replace(/\.ts$/, ".js")),
  );

  const missing = [];
  for (const module of modules) {
    try {
      await access(module);
    } catch {
      missing.push(relative(DIST, module));
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing built modules (run \`pnpm build\` first): ${missing.join(", ")}`,
    );
  }

  for (const module of modules) {
    await import(pathToFileURL(module).href);
  }

  process.stdout.write(`smoke: ${String(modules.length)} modules imported\n`);
};

await main();
