import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/env.js";

const base = {
  DOMAIN: "pantry.esempio.it",
  POSTGRES_PASSWORD: "segretissima",
  BETTER_AUTH_SECRET: "0123456789abcdef0123",
};

describe("loadConfig", () => {
  it("compone DATABASE_URL dalle sue parti", () => {
    const config = loadConfig({
      ...base,
      POSTGRES_HOST: "db",
      POSTGRES_USER: "pantry",
      POSTGRES_DB: "pantry",
    });
    expect(config.databaseUrl).toBe(
      "postgres://pantry:segretissima@db:5432/pantry",
    );
  });

  it("codifica i caratteri speciali della password", () => {
    const config = loadConfig({ ...base, POSTGRES_PASSWORD: "p@ss:w/rd?#" });
    expect(config.databaseUrl).toContain("p%40ss%3Aw%2Frd%3F%23");
  });

  it("fallisce senza password, invece di partire con un database aperto", () => {
    expect(() =>
      loadConfig({
        DOMAIN: base.DOMAIN,
        BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET,
      }),
    ).toThrow(/POSTGRES_PASSWORD/);
  });

  it("rifiuta un segreto troppo corto", () => {
    expect(() => loadConfig({ ...base, BETTER_AUTH_SECRET: "corto" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("usa http in sviluppo e https in produzione", () => {
    expect(loadConfig(base).appUrl).toBe("http://pantry.esempio.it");
    expect(loadConfig({ ...base, NODE_ENV: "production" }).appUrl).toBe(
      "https://pantry.esempio.it",
    );
  });

  it("aggiunge le origini extra a quella dell'app", () => {
    const config = loadConfig({
      ...base,
      EXTRA_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173",
    });
    expect(config.trustedOrigins).toEqual([
      "http://pantry.esempio.it",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  });

  it("rifiuta una porta fuori intervallo", () => {
    expect(() => loadConfig({ ...base, PORT: "70000" })).toThrow(/PORT/);
  });
});
