import { prisma } from "./prisma";
import { getRedisConnection } from "./queue";
import { getStorageProvider } from "./storage";

export type HealthCheckResult = {
  healthy: boolean;
  checks: {
    database: boolean;
    redis: boolean;
    storage: boolean;
  };
};

const HEALTH_CHECK_TIMEOUT_MS = 3000;

/**
 * Shared by the web app's /api/health route and the worker's own health
 * server, so both report on the same real dependencies (Postgres, Redis,
 * object storage) rather than each process just claiming "alive" because
 * it's running.
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  const [database, redis, storage] = await Promise.all([
    withTimeout(checkDatabase()),
    withTimeout(checkRedis()),
    withTimeout(checkStorage()),
  ]);

  return {
    healthy: database && redis && storage,
    checks: { database, redis, storage },
  };
}

/**
 * The Redis connection is shared with BullMQ and created with
 * maxRetriesPerRequest: null (required for BullMQ's blocking commands),
 * so a command issued while Redis is unreachable queues and retries
 * forever rather than rejecting — same risk applies to the S3 client,
 * which has no strict default request timeout of its own. Racing every
 * check against a fixed deadline is what actually makes /health respond
 * promptly during an outage instead of hanging indefinitely; the
 * underlying promise is left to settle in the background.
 */
export function withTimeout(check: Promise<boolean>): Promise<boolean> {
  return Promise.race([
    check,
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), HEALTH_CHECK_TIMEOUT_MS);
    }),
  ]);
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const pong = await getRedisConnection().ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

async function checkStorage(): Promise<boolean> {
  try {
    return await getStorageProvider().healthCheck();
  } catch {
    return false;
  }
}
