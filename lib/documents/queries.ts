import type { Document, PrismaClient } from "../../generated/prisma";

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
