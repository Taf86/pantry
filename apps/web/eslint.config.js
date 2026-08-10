import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default tseslint.config(
  globalIgnores(["dist"]),

  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  reactHooks.configs.recommended,
  reactRefresh.configs.vite,

  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json", "./../packages/*/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
