import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("parses a valid environment", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      NODE_ENV: "test",
      LOG_LEVEL: "info",
    });

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });

  it("throws a clear error naming the missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("defaults NODE_ENV and LOG_LEVEL when not provided", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        LOG_LEVEL: "verbose",
      }),
    ).toThrow(/LOG_LEVEL/);
  });
});
