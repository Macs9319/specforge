import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  AUTH_SECRET: "test-only-secret-not-for-real-use-0123456789",
  S3_BUCKET: "test-bucket",
  S3_ACCESS_KEY_ID: "test-access-key",
  S3_SECRET_ACCESS_KEY: "test-secret-key",
};

describe("loadEnv", () => {
  it("parses a valid environment", () => {
    const env = loadEnv(validEnv);

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
    expect(env.S3_BUCKET).toBe("test-bucket");
  });

  it("throws a clear error naming the missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("defaults NODE_ENV, LOG_LEVEL, S3_REGION, and S3_FORCE_PATH_STYLE when not provided", () => {
    const env = loadEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      AUTH_SECRET: validEnv.AUTH_SECRET,
      S3_BUCKET: validEnv.S3_BUCKET,
      S3_ACCESS_KEY_ID: validEnv.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: validEnv.S3_SECRET_ACCESS_KEY,
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.S3_REGION).toBe("us-east-1");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
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

  it("parses S3_FORCE_PATH_STYLE=true into a boolean", () => {
    const env = loadEnv({ ...validEnv, S3_FORCE_PATH_STYLE: "true" });
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("throws a clear error naming a missing S3 variable", () => {
    expect(() => loadEnv(validEnv)).not.toThrow();
    const { S3_BUCKET: _omit, ...withoutBucket } = validEnv;
    expect(() => loadEnv(withoutBucket)).toThrow(/S3_BUCKET/);
  });
});
