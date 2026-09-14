import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";

const base = {
  POSTGRES_HOST: "db",
  POSTGRES_PORT: "5432",
  POSTGRES_USER: "pantry",
  POSTGRES_DB: "pantry",
  POSTGRES_PASSWORD: "verysecret",
  DOMAIN: "pantry.example.com",
  BETTER_AUTH_SECRET: "test-secret-not-a-real-value",
};

describe("loadConfig", () => {
  it("builds DATABASE_URL from its parts", () => {
    const config = loadConfig(base);
    expect(config.databaseUrl).toBe(
      "postgres://pantry:verysecret@db:5432/pantry",
    );
  });

  it("encodes special characters in the password", () => {
    const config = loadConfig({ ...base, POSTGRES_PASSWORD: "p@ss:w/rd?#" });
    expect(config.databaseUrl).toContain("p%40ss%3Aw%2Frd%3F%23");
  });

  it("fails without a password, instead of starting with an open database", () => {
    expect(() => loadConfig({ ...base, POSTGRES_PASSWORD: undefined })).toThrow(
      /POSTGRES_PASSWORD/,
    );
  });

  it("rejects a secret that is too short", () => {
    expect(() => loadConfig({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("uses http in development and https in production", () => {
    expect(loadConfig(base).appUrl).toBe("http://pantry.example.com");
    expect(loadConfig({ ...base, NODE_ENV: "production" }).appUrl).toBe(
      "https://pantry.example.com",
    );
  });

  it("appends the extra origins to the app origin", () => {
    const config = loadConfig({
      ...base,
      EXTRA_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173",
    });
    expect(config.trustedOrigins).toEqual([
      "http://pantry.example.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  });

  it("rejects a port outside the valid range", () => {
    expect(() => loadConfig({ ...base, PORT: "70000" })).toThrow(/PORT/);
  });
});
