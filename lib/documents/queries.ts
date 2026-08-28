import type { Document, PrismaClient, ProcessingStatus } from "../../generated/prisma";

// A stable "current PRD" read shape for consumers that only need the live
// content, not the version history — the versioned storage underneath
// (Prd.currentVersion) stays an implementation detail behind this.
export type CurrentPrdSnapshot = {
  id: string;
  status: ProcessingStatus;
  errorMessage: string | null;
  content: string | null;
  editedAt: Date | null;
};

export function listUserDocuments(
  prisma: Pick<PrismaClient, "document">,
  userId: string,
): Promise<Document[]> {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetches a document only if it belongs to the given user. Returns null
 * both when the document doesn't exist and when it belongs to someone
 * else, so callers can respond 404 either way without confirming to an
 * unauthorized caller that the id belongs to another account.
 */
export async function findOwnedDocument(
  prisma: Pick<PrismaClient, "document">,
  userId: string,
  documentId: string,
): Promise<Document | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document || document.userId !== userId) {
    return null;
  }

  return document;
}

export async function findOwnedDocumentWithPrd(
  prisma: Pick<PrismaClient, "document">,
  userId: string,
  documentId: string,
): Promise<(Document & { prd: CurrentPrdSnapshot | null }) | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { prd: { include: { currentVersion: true } } },
  });

  if (!document || document.userId !== userId) {
    return null;
  }

  const { prd, ...rest } = document;
  return {
    ...rest,
    prd: prd
      ? {
          id: prd.id,
          status: prd.status,
          errorMessage: prd.errorMessage,
          content: prd.currentVersion?.content ?? null,
          editedAt: prd.currentVersion?.editedAt ?? null,
        }
      : null,
  };
}
