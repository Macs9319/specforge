import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUserDocuments } from "@/lib/documents/queries";
import {
  hasRemainingGenerationQuota,
  refundMostRecentGenerationEvent,
  tryConsumeGenerationQuota,
} from "@/lib/documents/rate-limit";
import { uploadDocument } from "@/lib/documents/upload-document";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueProcessDocumentJob } from "@/lib/queue";
import { getStorageProvider } from "@/lib/storage";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await listUserDocuments(prisma, session.user.id);

  return NextResponse.json({ documents });
}

const quotaExceededResponse = () =>
  NextResponse.json(
    {
      error: `You've reached your daily limit of ${env.GENERATION_DAILY_LIMIT} PRD generations. Try again tomorrow.`,
    },
    { status: 429 },
  );

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cheap pre-check so an over-quota user doesn't pay for a storage write
  // and DB insert before finding out. The real gate — the one that's
  // actually race-safe — is tryConsumeGenerationQuota below.
  const mightHaveQuota = await hasRemainingGenerationQuota(
    prisma,
    session.user.id,
    env.GENERATION_DAILY_LIMIT,
  );
  if (!mightHaveQuota) {
    return quotaExceededResponse();
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was provided." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();

  const result = await uploadDocument(
    { prisma, storage },
    {
      userId: session.user.id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    },
  );

  if (!result.ok) {
    const messages: Record<typeof result.error, string> = {
      FILE_TOO_LARGE: "File is too large. The maximum size is 10MB.",
      UNSUPPORTED_FILE_TYPE:
        "Unsupported file type. Please upload a PDF, DOCX, Markdown, or plain text file.",
    };
    return NextResponse.json(
      { error: messages[result.error] },
      { status: 400 },
    );
  }

  const consumedQuota = await tryConsumeGenerationQuota(
    prisma,
    session.user.id,
    env.GENERATION_DAILY_LIMIT,
  );
  if (!consumedQuota) {
    await prisma.document.delete({ where: { id: result.document.id } });
    await storage
      .deleteObject(result.document.storageKey)
      .catch((error: unknown) =>
        logger.warn({ err: error }, "Failed to clean up rejected upload's storage object"),
      );
    return quotaExceededResponse();
  }

  try {
    await enqueueProcessDocumentJob(result.document.id);
  } catch (error) {
    logger.error(
      { err: error, documentId: result.document.id },
      "Failed to enqueue processing job after upload; rolling back",
    );
    await prisma.document.delete({ where: { id: result.document.id } });
    await storage
      .deleteObject(result.document.storageKey)
      .catch(() => undefined);
    await refundMostRecentGenerationEvent(prisma, session.user.id);
    return NextResponse.json(
      { error: "Failed to queue this document for processing. Please try again." },
      { status: 500 },
    );
  }

  const { storageKey: _storageKey, ...publicDocument } = result.document;
  return NextResponse.json({ document: publicDocument }, { status: 201 });
}
