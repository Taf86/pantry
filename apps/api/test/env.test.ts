import { describe, expect, it } from "vitest";
import webpush from "web-push";

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

const generated = webpush.generateVAPIDKeys();
const VAPID = {
  VAPID_PUBLIC_KEY: generated.publicKey,
  VAPID_PRIVATE_KEY: generated.privateKey,
};

const TRUNCATED = Buffer.from("too short").toString("base64url");

describe("loadConfig: push", () => {
  it("leaves push off when no keys are given", () => {
    expect(loadConfig(base).push).toBeNull();
  });

  it("treats the empty strings Compose passes as absent", () => {
    const config = loadConfig({
      ...base,
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      VAPID_SUBJECT: "",
    });

    expect(config.push).toBeNull();
  });

  it("builds the push config when both keys are present", () => {
    const config = loadConfig({ ...base, ...VAPID });

    expect(config.push).toEqual({
      publicKey: VAPID.VAPID_PUBLIC_KEY,
      privateKey: VAPID.VAPID_PRIVATE_KEY,
      subject: "mailto:admin@pantry.example.com",
    });
  });

  it("keeps an explicit subject", () => {
    const config = loadConfig({
      ...base,
      ...VAPID,
      VAPID_SUBJECT: "https://pantry.example.com",
    });

    expect(config.push?.subject).toBe("https://pantry.example.com");
  });

  it("refuses a subject that is neither mailto: nor https:", () => {
    expect(() =>
      loadConfig({ ...base, ...VAPID, VAPID_SUBJECT: "admin@example.com" }),
    ).toThrow(/VAPID_SUBJECT/);
  });

  it("refuses half a configuration, naming the missing half", () => {
    expect(() =>
      loadConfig({ ...base, VAPID_PUBLIC_KEY: VAPID.VAPID_PUBLIC_KEY }),
    ).toThrow(/VAPID_PRIVATE_KEY/);

    expect(() =>
      loadConfig({ ...base, VAPID_PRIVATE_KEY: VAPID.VAPID_PRIVATE_KEY }),
    ).toThrow(/VAPID_PUBLIC_KEY/);
  });

  it("refuses a key of the wrong shape, rather than a 401 months later", () => {
    expect(() =>
      loadConfig({ ...base, ...VAPID, VAPID_PUBLIC_KEY: TRUNCATED }),
    ).toThrow(/VAPID_PUBLIC_KEY/);

    expect(() =>
      loadConfig({ ...base, ...VAPID, VAPID_PRIVATE_KEY: TRUNCATED }),
    ).toThrow(/VAPID_PRIVATE_KEY/);
  });
});
