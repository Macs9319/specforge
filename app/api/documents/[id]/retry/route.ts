import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOwnedDocumentWithPrd } from "@/lib/documents/queries";
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

  const retryingParse = document.status === "FAILED";
  const retryingGenerate = document.prd?.status === "FAILED";

  if (retryingParse) {
    await prisma.document.update({
      where: { id },
      data: { status: "PENDING", errorMessage: null },
    });
  } else if (retryingGenerate) {
    await prisma.prd.update({
      where: { documentId: id },
      data: { status: "PENDING", errorMessage: null },
    });
  } else {
    return NextResponse.json(
      { error: "This document isn't in a failed state." },
      { status: 400 },
    );
  }

  try {
    await enqueueProcessDocumentJob(id);
  } catch (error) {
    logger.error(
      { err: error, documentId: id },
      "Failed to enqueue retry job; reverting to FAILED rather than leaving it stuck",
    );
    const message = "Failed to queue retry. Please try again.";
    if (retryingParse) {
      await prisma.document
        .update({ where: { id }, data: { status: "FAILED", errorMessage: message } })
        .catch(() => undefined);
    } else {
      await prisma.prd
        .update({ where: { documentId: id }, data: { status: "FAILED", errorMessage: message } })
        .catch(() => undefined);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ status: "PENDING" }, { status: 202 });
}
