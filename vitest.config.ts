import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      AUTH_SECRET: "test-only-secret-not-for-real-use-0123456789",
    },
  },
});
