import "dotenv/config";
import { Worker } from "bullmq";
import { createServer } from "node:http";
import { checkHealth } from "../lib/health";
import { getLLMProvider } from "../lib/llm";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  getRedisConnection,
  PROCESS_DOCUMENT_QUEUE,
  type ProcessDocumentJobData,
} from "../lib/queue";
import { getStorageProvider } from "../lib/storage";
import { processDocumentJob } from "../lib/worker/process-document-job";
import { ProcessingStageError } from "../lib/worker/processing-stage-error";

const worker = new Worker<ProcessDocumentJobData>(
  PROCESS_DOCUMENT_QUEUE,
  async (job) => {
    await processDocumentJob(
      { prisma, storage: getStorageProvider(), llm: getLLMProvider() },
      job.data,
    );
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  logger.info(
    { jobId: job.id, documentId: job.data.documentId },
    "Document processed successfully",
  );
});

worker.on("failed", async (job, err) => {
  if (!job) return;

  const attemptsMax = job.opts.attempts ?? 1;
  if (job.attemptsMade < attemptsMax) {
    logger.warn(
      {
        jobId: job.id,
        documentId: job.data.documentId,
        attempt: job.attemptsMade,
        err,
      },
      "Processing attempt failed; will retry",
    );
    return;
  }

  const { documentId } = job.data;
  const stage = err instanceof ProcessingStageError ? err.stage : "generate";
  const message = err.message;

  logger.error(
    { jobId: job.id, documentId, stage, err },
    "Processing failed after exhausting retries",
  );

  try {
    if (stage === "parse") {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED", errorMessage: message },
      });
    } else {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });
      if (document) {
        await prisma.prd.upsert({
          where: { documentId },
          create: {
            documentId,
            userId: document.userId,
            status: "FAILED",
            errorMessage: message,
          },
          update: { status: "FAILED", errorMessage: message },
        });
      }
    }
  } catch (updateError) {
    logger.error(
      { err: updateError, documentId },
      "Failed to persist FAILED status after exhausting retries",
    );
  }
});

worker.on("error", (err) => {
  logger.error({ err }, "Worker connection error");
});

// Not exposed outside the docker network — this is purely so
// docker-compose (or any orchestrator) has something to poll, matching
// what /api/health gives the web service.
const HEALTH_PORT = 3001;

const healthServer = createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404);
    res.end();
    return;
  }

  checkHealth()
    .then((result) => {
      res.writeHead(result.healthy ? 200 : 503, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, "Health check itself threw");
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ healthy: false }));
    });
});

healthServer.listen(HEALTH_PORT, () => {
  logger.info({ port: HEALTH_PORT }, "Worker health endpoint listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down worker");
  await worker.close();
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info("Worker started, listening for process-document jobs");
