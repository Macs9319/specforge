import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOwnedDocumentWithPrd } from "@/lib/documents/queries";
import {
  hasRemainingGenerationQuota,
  recordGenerationEvent,
} from "@/lib/documents/rate-limit";
import { env } from "@/lib/env";
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

  if (!document.extractedText) {
    return NextResponse.json(
      { error: "This document hasn't finished parsing yet." },
      { status: 400 },
    );
  }

  const withinQuota = await hasRemainingGenerationQuota(
    prisma,
    session.user.id,
    env.GENERATION_DAILY_LIMIT,
  );
  if (!withinQuota) {
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

  await recordGenerationEvent(prisma, session.user.id);
  await enqueueProcessDocumentJob(id);

  return NextResponse.json({ status: "PENDING" }, { status: 202 });
}
