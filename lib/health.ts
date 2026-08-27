import { prisma } from "./prisma";
import { getRedisConnection } from "./queue";

export type HealthCheckResult = {
  healthy: boolean;
  checks: {
    database: boolean;
    redis: boolean;
  };
};

/**
 * Shared by the web app's /api/health route and the worker's own health
 * server, so both report on the same real dependencies (Postgres, Redis)
 * rather than each process just claiming "alive" because it's running.
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  return {
    healthy: database && redis,
    checks: { database, redis },
  };
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
