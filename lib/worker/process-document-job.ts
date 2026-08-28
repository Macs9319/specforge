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
      const versionCount = await tx.prdVersion.count({
        where: { prdId: prd.id },
      });

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
