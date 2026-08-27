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
  REDIS_URL: "redis://localhost:6379",
  ANTHROPIC_API_KEY: "sk-ant-test-key",
};

describe("loadEnv", () => {
  it("parses a valid environment", () => {
    const env = loadEnv(validEnv);

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
    expect(env.S3_BUCKET).toBe("test-bucket");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("throws a clear error naming the missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("defaults NODE_ENV, LOG_LEVEL, S3_REGION, S3_FORCE_PATH_STYLE, LLM_PROVIDER, ANTHROPIC_MODEL, LLM_EFFORT, and GENERATION_DAILY_LIMIT when not provided", () => {
    const env = loadEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      AUTH_SECRET: validEnv.AUTH_SECRET,
      S3_BUCKET: validEnv.S3_BUCKET,
      S3_ACCESS_KEY_ID: validEnv.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: validEnv.S3_SECRET_ACCESS_KEY,
      REDIS_URL: validEnv.REDIS_URL,
      ANTHROPIC_API_KEY: validEnv.ANTHROPIC_API_KEY,
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.S3_REGION).toBe("us-east-1");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.LLM_PROVIDER).toBe("anthropic");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-5");
    expect(env.LLM_EFFORT).toBe("high");
    expect(env.GENERATION_DAILY_LIMIT).toBe(10);
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

  it("coerces GENERATION_DAILY_LIMIT from a string to a number", () => {
    const env = loadEnv({ ...validEnv, GENERATION_DAILY_LIMIT: "25" });
    expect(env.GENERATION_DAILY_LIMIT).toBe(25);
  });

  it("requires ANTHROPIC_API_KEY when LLM_PROVIDER is anthropic (the default)", () => {
    const { ANTHROPIC_API_KEY: _omit, ...withoutKey } = validEnv;
    expect(() => loadEnv(withoutKey)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("does not require ANTHROPIC_API_KEY when LLM_PROVIDER=fake", () => {
    const { ANTHROPIC_API_KEY: _omit, ...withoutKey } = validEnv;
    expect(() =>
      loadEnv({ ...withoutKey, LLM_PROVIDER: "fake" }),
    ).not.toThrow();
  });

  it("treats an empty-string ANTHROPIC_API_KEY the same as an absent one (docker-compose's ${VAR:-} sets '', not undefined)", () => {
    expect(() =>
      loadEnv({ ...validEnv, LLM_PROVIDER: "fake", ANTHROPIC_API_KEY: "" }),
    ).not.toThrow();

    expect(() =>
      loadEnv({ ...validEnv, ANTHROPIC_API_KEY: "" }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("treats an empty-string S3_ENDPOINT the same as an absent one", () => {
    const env = loadEnv({ ...validEnv, S3_ENDPOINT: "" });
    expect(env.S3_ENDPOINT).toBeUndefined();
  });
});
