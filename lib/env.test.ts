import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  AUTH_SECRET: "test-only-secret-not-for-real-use-0123456789",
};

describe("loadEnv", () => {
  it("parses a valid environment", () => {
    const env = loadEnv(validEnv);

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });

  it("throws a clear error naming the missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("defaults NODE_ENV and LOG_LEVEL when not provided", () => {
    const env = loadEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      AUTH_SECRET: validEnv.AUTH_SECRET,
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() =>
      loadEnv({ ...validEnv, LOG_LEVEL: "verbose" }),
    ).toThrow(/LOG_LEVEL/);
  });

  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      loadEnv({ ...validEnv, AUTH_SECRET: "too-short" }),
    ).toThrow(/AUTH_SECRET/);
  });
});
