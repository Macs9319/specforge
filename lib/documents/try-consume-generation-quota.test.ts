import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../prisma";
import { tryConsumeGenerationQuota } from "./rate-limit";

const createdUserIds: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

async function createTestUser() {
  const user = await prisma.user.create({
    data: {
      email: `quota-test-${randomUUID()}@example.com`,
      passwordHash: "unused",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("tryConsumeGenerationQuota", () => {
  it("allows and records a generation when under the limit", async () => {
    const user = await createTestUser();

    const allowed = await tryConsumeGenerationQuota(prisma, user.id, 10);
    expect(allowed).toBe(true);

    const count = await prisma.generationEvent.count({
      where: { userId: user.id },
    });
    expect(count).toBe(1);
  });

  it("denies once the limit is reached, without recording an extra event", async () => {
    const user = await createTestUser();

    for (let i = 0; i < 3; i++) {
      await tryConsumeGenerationQuota(prisma, user.id, 3);
    }
    const denied = await tryConsumeGenerationQuota(prisma, user.id, 3);
    expect(denied).toBe(false);

    const count = await prisma.generationEvent.count({
      where: { userId: user.id },
    });
    expect(count).toBe(3);
  });

  it("lets only one of two concurrent requests through at the limit boundary", async () => {
    const user = await createTestUser();

    for (let i = 0; i < 4; i++) {
      await tryConsumeGenerationQuota(prisma, user.id, 5);
    }

    const [first, second] = await Promise.all([
      tryConsumeGenerationQuota(prisma, user.id, 5),
      tryConsumeGenerationQuota(prisma, user.id, 5),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);

    const count = await prisma.generationEvent.count({
      where: { userId: user.id },
    });
    expect(count).toBe(5);
  });
});
