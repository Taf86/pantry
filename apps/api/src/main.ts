// import { loadConfig } from "./config/env.js";

const main = async (): Promise<void> => {
  // const config = loadConfig();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
