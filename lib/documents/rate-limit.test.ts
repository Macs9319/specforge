import { describe, expect, it, vi } from "vitest";
import { hasRemainingGenerationQuota } from "./rate-limit";

describe("hasRemainingGenerationQuota", () => {
  it("allows a generation when under the limit", async () => {
    const count = vi.fn().mockResolvedValue(3);
    const allowed = await hasRemainingGenerationQuota(
      { generationEvent: { count } } as never,
      "user_1",
      10,
    );
    expect(allowed).toBe(true);
  });

  it("blocks a generation once the limit is reached", async () => {
    const count = vi.fn().mockResolvedValue(10);
    const allowed = await hasRemainingGenerationQuota(
      { generationEvent: { count } } as never,
      "user_1",
      10,
    );
    expect(allowed).toBe(false);
  });

  it("scopes the count to the user and a rolling 24h window", async () => {
    const count = vi.fn().mockResolvedValue(0);
    await hasRemainingGenerationQuota(
      { generationEvent: { count } } as never,
      "user_1",
      10,
    );

    const [[args]] = count.mock.calls;
    expect(args.where.userId).toBe("user_1");
    expect(args.where.createdAt.gte).toBeInstanceOf(Date);
    expect(args.where.createdAt.gte.getTime()).toBeLessThan(Date.now());
  });
});
