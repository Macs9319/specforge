import type { PrismaClient } from "../../generated/prisma";

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function hasRemainingGenerationQuota(
  prisma: Pick<PrismaClient, "generationEvent">,
  userId: string,
  dailyLimit: number,
): Promise<boolean> {
  const since = new Date(Date.now() - ROLLING_WINDOW_MS);
  const count = await prisma.generationEvent.count({
    where: { userId, createdAt: { gte: since } },
  });
  return count < dailyLimit;
}

export function recordGenerationEvent(
  prisma: Pick<PrismaClient, "generationEvent">,
  userId: string,
): Promise<unknown> {
  return prisma.generationEvent.create({ data: { userId } });
}
