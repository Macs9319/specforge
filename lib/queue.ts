import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const PROCESS_DOCUMENT_QUEUE = "process-document";

export type ProcessDocumentJobData = {
  documentId: string;
};

let connection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

let queue: Queue<ProcessDocumentJobData> | undefined;

function getDocumentQueue(): Queue<ProcessDocumentJobData> {
  if (!queue) {
    queue = new Queue<ProcessDocumentJobData>(PROCESS_DOCUMENT_QUEUE, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function enqueueProcessDocumentJob(
  documentId: string,
): Promise<void> {
  await getDocumentQueue().add(
    "process",
    { documentId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  );
}
