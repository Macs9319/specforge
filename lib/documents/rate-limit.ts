import type { PrismaClient } from "../../generated/prisma";
import { Prisma } from "../../generated/prisma";

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

const MAX_QUOTA_TRANSACTION_ATTEMPTS = 3;

function isWriteConflict(error: unknown): boolean {
  // Prisma's error code for "transaction failed due to a write conflict
  // or deadlock" under Serializable isolation — the expected, benign
  // outcome when two concurrent requests genuinely race for the same
  // quota slot, not a real failure.
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

/**
 * Atomically checks the rolling-24h generation quota and consumes a slot
 * if one is available. hasRemainingGenerationQuota + recordGenerationEvent
 * as two separate calls is a check-then-act race: two concurrent requests
 * (a double-click, two tabs) can both see "under the limit" and both
 * proceed. Running both under a Serializable transaction makes Postgres
 * abort one side of any such conflict instead of letting both through.
 *
 * A write-conflict abort here doesn't mean the quota was actually
 * exceeded — it means this attempt collided with a concurrent one, so
 * it's retried a few times (each retry re-reads the true count) rather
 * than immediately reporting "quota exceeded" for what's really just
 * contention. Only once retries are exhausted does it fail closed. Any
 * other error is rethrown rather than mislabeled as a quota rejection.
 */
export async function tryConsumeGenerationQuota(
  prisma: Pick<PrismaClient, "generationEvent" | "$transaction">,
  userId: string,
  dailyLimit: number,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_QUOTA_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const allowed = await hasRemainingGenerationQuota(
            tx,
            userId,
            dailyLimit,
          );
          if (!allowed) return false;
          await recordGenerationEvent(tx, userId);
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isWriteConflict(error)) {
        throw error;
      }
      if (attempt === MAX_QUOTA_TRANSACTION_ATTEMPTS) {
        return false;
      }
      // retry — another concurrent attempt won this round
    }
  }
  return false;
}

/**
 * Best-effort refund of the quota slot most recently consumed by this
 * user, for when a downstream step (enqueueing the job) fails after
 * tryConsumeGenerationQuota already succeeded. There's no handle back to
 * "the exact row" from that call, but each caller only ever consumes one
 * slot per request, so the most recent event for this user is the one to
 * remove.
 */
export async function refundMostRecentGenerationEvent(
  prisma: Pick<PrismaClient, "generationEvent">,
  userId: string,
): Promise<void> {
  const recentEvent = await prisma.generationEvent.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (recentEvent) {
    await prisma.generationEvent
      .delete({ where: { id: recentEvent.id } })
      .catch(() => undefined);
  }
}
