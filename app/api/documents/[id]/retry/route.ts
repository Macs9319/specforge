import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOwnedDocumentWithPrd } from "@/lib/documents/queries";
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

  if (document.status === "FAILED") {
    await prisma.document.update({
      where: { id },
      data: { status: "PENDING", errorMessage: null },
    });
  } else if (document.prd?.status === "FAILED") {
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

  await enqueueProcessDocumentJob(id);

  return NextResponse.json({ status: "PENDING" }, { status: 202 });
}
