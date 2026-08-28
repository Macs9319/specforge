import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { FakeLLMProvider } from "../llm/fake-llm-provider";
import { prisma } from "../prisma";
import { FakeStorageProvider } from "../storage/fake-storage-provider";
import { processDocumentJob } from "./process-document-job";
import { ProcessingStageError } from "./processing-stage-error";

const createdUserIds: string[] = [];

afterEach(async () => {
  // User -> Document -> Prd all cascade-delete, so removing the user
  // cleans up everything a test created.
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

async function createTestUserAndDocument(overrides?: {
  extractedText?: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: `worker-test-${randomUUID()}@example.com`,
      passwordHash: "unused",
    },
  });
  createdUserIds.push(user.id);

  const document = await prisma.document.create({
    data: {
      userId: user.id,
      title: "process-flow.txt",
      originalFilename: "process-flow.txt",
      fileType: "TEXT",
      mimeType: "text/plain",
      fileSizeBytes: 100,
      storageKey: `${user.id}/${randomUUID()}-process-flow.txt`,
      status: overrides?.extractedText ? "COMPLETE" : "PENDING",
      extractedText: overrides?.extractedText,
    },
  });

  return { user, document };
}

describe("processDocumentJob", () => {
  it("parses the document and generates a PRD end to end", async () => {
    const { document } = await createTestUserAndDocument();

    const storage = new FakeStorageProvider();
    await storage.putObject(
      document.storageKey,
      Buffer.from("Step 1: submit. Step 2: review."),
      "text/plain",
    );
    const llm = new FakeLLMProvider({
      markdown: "## Overview\n\nGenerated PRD.",
      modelId: "fake-model",
      inputTokens: 42,
      outputTokens: 84,
    });

    await processDocumentJob(
      { prisma, storage, llm },
      { documentId: document.id },
    );

    const updatedDocument = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updatedDocument.status).toBe("COMPLETE");
    expect(updatedDocument.extractedText).toBe(
      "Step 1: submit. Step 2: review.",
    );

    const prd = await prisma.prd.findUniqueOrThrow({
      where: { documentId: document.id },
      include: { currentVersion: true },
    });
    expect(prd.status).toBe("COMPLETE");
    expect(prd.currentVersion?.versionNumber).toBe(1);
    expect(prd.currentVersion?.content).toBe("## Overview\n\nGenerated PRD.");
    expect(prd.currentVersion?.modelId).toBe("fake-model");
    expect(prd.currentVersion?.inputTokens).toBe(42);
    expect(prd.currentVersion?.outputTokens).toBe(84);
    expect(prd.currentVersion?.generatedAt).not.toBeNull();

    expect(llm.calls).toEqual([
      {
        documentTitle: "process-flow.txt",
        documentText: "Step 1: submit. Step 2: review.",
      },
    ]);
  });

  it("regenerating creates a new version rather than overwriting the previous one, and the new version has no stale edit timestamp", async () => {
    const { document } = await createTestUserAndDocument({
      extractedText: "Already parsed text.",
    });
    const prd = await prisma.prd.create({
      data: {
        documentId: document.id,
        userId: document.userId,
        status: "PENDING",
      },
    });
    const previousVersion = await prisma.prdVersion.create({
      data: {
        prdId: prd.id,
        versionNumber: 1,
        content: "old hand-edited content",
        editedAt: new Date(),
      },
    });
    await prisma.prd.update({
      where: { id: prd.id },
      data: { currentVersionId: previousVersion.id },
    });

    await processDocumentJob(
      { prisma, storage: new FakeStorageProvider(), llm: new FakeLLMProvider() },
      { documentId: document.id },
    );

    const updatedPrd = await prisma.prd.findUniqueOrThrow({
      where: { documentId: document.id },
      include: { currentVersion: true },
    });
    expect(updatedPrd.currentVersion?.versionNumber).toBe(2);
    expect(updatedPrd.currentVersion?.editedAt).toBeNull();
    expect(updatedPrd.currentVersion?.id).not.toBe(previousVersion.id);

    // The previous version is still there, untouched — this is the whole
    // point of versioning: regenerating doesn't destroy prior content.
    const stillThere = await prisma.prdVersion.findUniqueOrThrow({
      where: { id: previousVersion.id },
    });
    expect(stillThere.content).toBe("old hand-edited content");
    expect(stillThere.editedAt).not.toBeNull();
  });

  it("skips parsing when extractedText already exists (retry/regenerate)", async () => {
    const { document } = await createTestUserAndDocument({
      extractedText: "Already parsed text.",
    });

    const storage = new FakeStorageProvider();
    const llm = new FakeLLMProvider();

    await processDocumentJob(
      { prisma, storage, llm },
      { documentId: document.id },
    );

    expect(llm.calls).toEqual([
      { documentTitle: "process-flow.txt", documentText: "Already parsed text." },
    ]);

    const prd = await prisma.prd.findUniqueOrThrow({
      where: { documentId: document.id },
    });
    expect(prd.status).toBe("COMPLETE");
  });

  it("throws a parse-stage error when the storage object is missing, leaving Document mid-processing", async () => {
    const { document } = await createTestUserAndDocument();

    const storage = new FakeStorageProvider(); // empty: getObject will throw
    const llm = new FakeLLMProvider();

    const error = await processDocumentJob(
      { prisma, storage, llm },
      { documentId: document.id },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProcessingStageError);
    expect((error as ProcessingStageError).stage).toBe("parse");

    const updatedDocument = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    // Not marked FAILED here — that's the queue's failed-handler's job,
    // only once retries are exhausted.
    expect(updatedDocument.status).toBe("PROCESSING");
  });

  it("throws a generate-stage error when the LLM call fails, after parsing succeeds", async () => {
    const { document } = await createTestUserAndDocument();

    const storage = new FakeStorageProvider();
    await storage.putObject(
      document.storageKey,
      Buffer.from("some text"),
      "text/plain",
    );
    const llm = new FakeLLMProvider(() => {
      throw new Error("LLM exploded");
    });

    const error = await processDocumentJob(
      { prisma, storage, llm },
      { documentId: document.id },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProcessingStageError);
    expect((error as ProcessingStageError).stage).toBe("generate");

    const updatedDocument = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updatedDocument.status).toBe("COMPLETE");

    const prd = await prisma.prd.findUniqueOrThrow({
      where: { documentId: document.id },
    });
    expect(prd.status).toBe("PROCESSING");
  });
});
