import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  /**
   * Deliberatamente **senza** `clean`.
   *
   * Svuotare `dist` all'inizio di ogni build apre una finestra in cui il
   * pacchetto non è risolvibile, e in un monorepo quella finestra la attraversa
   * qualcun altro: l'API in `tsx watch` che importa `pantry-shared` muore con
   * `ERR_MODULE_NOT_FOUND` a ogni salvataggio, e un `seed:admin` lanciato nel
   * momento sbagliato fallisce senza una ragione visibile.
   *
   * Non ci sono file orfani da temere: un solo entry point, nomi di output
   * fissi, sempre sovrascritti.
   */
  clean: false,
  sourcemap: true,
  splitting: false,
  target: "es2020",
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
  },
});
