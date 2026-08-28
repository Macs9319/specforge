import type { LLMProvider } from "../llm/types";
import { parseDocument } from "../parsers";
import type { StorageProvider } from "../storage/types";
import type { PrismaClient } from "../../generated/prisma";
import { ProcessingStageError } from "./processing-stage-error";

export type ProcessDocumentJobDeps = {
  prisma: Pick<PrismaClient, "document" | "prd" | "prdVersion" | "$transaction">;
  storage: StorageProvider;
  llm: LLMProvider;
};

export type ProcessDocumentJobInput = {
  documentId: string;
};

/**
 * Parses the uploaded document (if not already parsed) and generates its
 * PRD. Skipping the parse stage when extractedText already exists is what
 * makes this one function correctly handle a fresh upload, a "Retry" after
 * a parse or generate failure, and a "Regenerate" — the only difference
 * between them is which fields are already populated when this runs.
 *
 * Throws ProcessingStageError on failure so the caller (the worker's
 * queue-level "failed" handler) knows which record to mark FAILED once
 * BullMQ's retries are exhausted; this function itself never writes a
 * FAILED status; that decision is what the queue is doing.
 */
export async function processDocumentJob(
  deps: ProcessDocumentJobDeps,
  input: ProcessDocumentJobInput,
): Promise<void> {
  const document = await deps.prisma.document.findUniqueOrThrow({
    where: { id: input.documentId },
  });

  let extractedText = document.extractedText;

  // Distinguish "never parsed" (null) from "parsed to an empty string"
  // (a scanned/image-only PDF, an empty upload) — the latter is done and
  // must not be re-parsed on every subsequent retry/regenerate.
  if (extractedText === null) {
    await deps.prisma.document.update({
      where: { id: document.id },
      data: { status: "PROCESSING" },
    });

    try {
      const buffer = await deps.storage.getObject(document.storageKey);
      extractedText = await parseDocument(document.fileType, buffer);
    } catch (error) {
      throw new ProcessingStageError(
        "parse",
        error instanceof Error
          ? error.message
          : "Failed to parse the document.",
        { cause: error },
      );
    }

    await deps.prisma.document.update({
      where: { id: document.id },
      data: { status: "COMPLETE", extractedText, errorMessage: null },
    });
  }

  const prd = await deps.prisma.prd.upsert({
    where: { documentId: document.id },
    create: {
      documentId: document.id,
      userId: document.userId,
      status: "PROCESSING",
    },
    update: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const result = await deps.llm.generatePrd({
      documentTitle: document.title,
      documentText: extractedText,
    });

    await deps.prisma.$transaction(async (tx) => {
      // Locks this Prd row for the rest of the transaction, so a
      // concurrently-running job for the same document (BullMQ can
      // redeliver a stalled job, or two rapid Regenerate clicks can both
      // pass the route's status check before either writes PROCESSING)
      // can't compute the same next versionNumber below — it blocks here
      // until this transaction commits, then sees this version counted.
      await tx.$queryRaw`SELECT id FROM "Prd" WHERE id = ${prd.id} FOR UPDATE`;

      let versionCount = await tx.prdVersion.count({
        where: { prdId: prd.id },
      });

      // Migration safety net: this Prd predates the PrdVersion migration
      // (currentVersionId is still null) and hasn't been backfilled yet,
      // but its legacy `content` column holds real prior content — preserve
      // it as version 1 before writing the new generation, so a regenerate
      // that lands between deploying this migration and running
      // scripts/backfill-prd-versions.ts doesn't silently discard it.
      if (versionCount === 0 && prd.content !== null) {
        await tx.prdVersion.create({
          data: {
            prdId: prd.id,
            versionNumber: 1,
            content: prd.content,
            modelId: prd.modelId,
            inputTokens: prd.inputTokens,
            outputTokens: prd.outputTokens,
            generatedAt: prd.generatedAt,
            editedAt: prd.editedAt,
          },
        });
        versionCount = 1;
      }

      const version = await tx.prdVersion.create({
        data: {
          prdId: prd.id,
          versionNumber: versionCount + 1,
          content: result.markdown,
          modelId: result.modelId,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          generatedAt: new Date(),
        },
      });

      await tx.prd.update({
        where: { id: prd.id },
        data: {
          status: "COMPLETE",
          currentVersionId: version.id,
          errorMessage: null,
        },
      });
    });
  } catch (error) {
    throw new ProcessingStageError(
      "generate",
      error instanceof Error ? error.message : "Failed to generate the PRD.",
      { cause: error },
    );
  }
}
