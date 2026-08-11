import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Carica il `.env` di sviluppo, così le suite di integrazione si attivano
    // da sole quando il database c'è.
    setupFiles: ["./test/setup-env.ts"],
    // Le suite di integrazione condividono un solo database: non possono
    // girare in parallelo senza calpestarsi.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
