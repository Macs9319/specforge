import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./health";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the check's own result when it settles quickly", async () => {
    const result = withTimeout(Promise.resolve(true));
    await expect(result).resolves.toBe(true);
  });

  it("resolves false once the deadline passes, even if the check never settles", async () => {
    const neverResolves = new Promise<boolean>(() => {});

    const result = withTimeout(neverResolves);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBe(false);
  });

  it("does not time out a check that resolves just under the deadline", async () => {
    const almostImmediately = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 2000);
    });

    const result = withTimeout(almostImmediately);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).resolves.toBe(true);
  });
});
