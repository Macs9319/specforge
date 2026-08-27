import type { Prd, PrismaClient } from "../../generated/prisma";

/**
 * Fetches a PRD only if it belongs to the given user. Returns null both
 * when it doesn't exist and when it belongs to someone else, so callers
 * can respond 404 either way without confirming the id exists.
 */
export async function findOwnedPrd(
  prisma: Pick<PrismaClient, "prd">,
  userId: string,
  prdId: string,
): Promise<Prd | null> {
  const prd = await prisma.prd.findUnique({ where: { id: prdId } });

  if (!prd || prd.userId !== userId) {
    return null;
  }

  return prd;
}
