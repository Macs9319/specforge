import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOwnedDocument, findOwnedDocumentWithPrd } from "@/lib/documents/queries";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

export async function GET(
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

  return NextResponse.json({ document });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const document = await findOwnedDocument(prisma, session.user.id, id);

  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await getStorageProvider().deleteObject(document.storageKey);
  } catch (error) {
    logger.warn(
      { err: error, storageKey: document.storageKey },
      "Failed to delete storage object for document; continuing to delete the database record",
    );
  }

  await prisma.document.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
