import { describe, expect, it, vi } from "vitest";
import { hasRemainingGenerationQuota, tryConsumeGenerationQuota } from "./rate-limit";

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

function fakePrismaWithTransactionBehavior(
  behavior: (attempt: number) => "conflict" | "other-error" | "run",
) {
  let attempt = 0;
  const count = vi.fn().mockResolvedValue(0);
  const create = vi.fn().mockResolvedValue({});
  const tx = { generationEvent: { count, create } };
  const $transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
    attempt += 1;
    const outcome = behavior(attempt);
    if (outcome === "conflict") {
      throw { code: "P2034", message: "write conflict" };
    }
    if (outcome === "other-error") {
      throw new Error("connection lost");
    }
    return fn(tx);
  });
  return { generationEvent: { count, create }, $transaction } as never;
}

describe("tryConsumeGenerationQuota", () => {
  it("retries a write conflict and succeeds once it clears", async () => {
    const prisma = fakePrismaWithTransactionBehavior((attempt) =>
      attempt < 2 ? "conflict" : "run",
    );

    const allowed = await tryConsumeGenerationQuota(prisma, "user_1", 10);

    expect(allowed).toBe(true);
  });

  it("fails closed only after retries are exhausted on sustained conflict", async () => {
    const prisma = fakePrismaWithTransactionBehavior(() => "conflict");

    const allowed = await tryConsumeGenerationQuota(prisma, "user_1", 10);

    expect(allowed).toBe(false);
  });

  it("rethrows a non-conflict error instead of reporting it as quota exceeded", async () => {
    const prisma = fakePrismaWithTransactionBehavior(() => "other-error");

    await expect(
      tryConsumeGenerationQuota(prisma, "user_1", 10),
    ).rejects.toThrow("connection lost");
  });
});
