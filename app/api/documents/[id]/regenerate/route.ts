import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOwnedDocumentWithPrd } from "@/lib/documents/queries";
import {
  refundMostRecentGenerationEvent,
  tryConsumeGenerationQuota,
} from "@/lib/documents/rate-limit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueProcessDocumentJob } from "@/lib/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const document = await findOwnedDocumentWithPrd(prisma, session.user.id, id);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (document.extractedText === null) {
    return NextResponse.json(
      { error: "This document hasn't finished parsing yet." },
      { status: 400 },
    );
  }

  if (
    document.prd?.status === "PENDING" ||
    document.prd?.status === "PROCESSING"
  ) {
    return NextResponse.json(
      { error: "A generation is already in progress for this document." },
      { status: 409 },
    );
  }

  const consumedQuota = await tryConsumeGenerationQuota(
    prisma,
    session.user.id,
    env.GENERATION_DAILY_LIMIT,
  );
  if (!consumedQuota) {
    return NextResponse.json(
      {
        error: `You've reached your daily limit of ${env.GENERATION_DAILY_LIMIT} PRD generations. Try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  await prisma.prd.upsert({
    where: { documentId: id },
    create: { documentId: id, userId: session.user.id, status: "PENDING" },
    update: { status: "PENDING", errorMessage: null },
  });

  try {
    await enqueueProcessDocumentJob(id);
  } catch (error) {
    logger.error(
      { err: error, documentId: id },
      "Failed to enqueue regeneration job; marking as failed rather than leaving it stuck",
    );
    await prisma.prd
      .update({
        where: { documentId: id },
        data: {
          status: "FAILED",
          errorMessage: "Failed to queue regeneration. Please try again.",
        },
      })
      .catch(() => undefined);
    await refundMostRecentGenerationEvent(prisma, session.user.id);
    return NextResponse.json(
      { error: "Failed to queue regeneration. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "PENDING" }, { status: 202 });
}
