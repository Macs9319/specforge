import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      AUTH_SECRET: "test-only-secret-not-for-real-use-0123456789",
      S3_BUCKET: "test-bucket",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
    },
  },
});
