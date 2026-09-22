import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const SKIP = new Set(["main.js"]);

const walk = async (dir) => {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (entry.name.endsWith(".js")) found.push(path);
  }
  return found;
};

const main = async () => {
  const files = (await walk(DIST)).filter(
    (file) => !SKIP.has(relative(DIST, file).replaceAll("\\", "/")),
  );

  if (files.length === 0) {
    throw new Error("No built modules found: run `pnpm build` first.");
  }

  for (const file of files) {
    await import(pathToFileURL(file).href);
  }

  process.stdout.write(`smoke: ${String(files.length)} modules imported\n`);
};

await main();
