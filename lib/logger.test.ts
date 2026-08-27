import { describe, expect, it } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  it("creates a usable pino logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });
});
