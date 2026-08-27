import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      // Points at the local docker-compose Postgres: the process-document-job
      // integration test needs a real database, per the spec's testing
      // decision. Requires `docker compose up -d postgres` to be running.
      DATABASE_URL: "postgresql://specforge:specforge@localhost:5432/specforge",
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      AUTH_SECRET: "test-only-secret-not-for-real-use-0123456789",
      S3_BUCKET: "test-bucket",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
      REDIS_URL: "redis://localhost:6379",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
    },
  },
});
