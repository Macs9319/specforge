import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * One-off backfill for the PrdVersion migration: every existing Prd row
 * with content but no currentVersionId gets that content copied into a new
 * version-1 PrdVersion row, and Prd.currentVersionId repointed at it.
 * Idempotent — rows that already have a currentVersionId are skipped, so
 * it's safe to re-run.
 */
async function main() {
  const prdsToBackfill = await prisma.prd.findMany({
    where: { currentVersionId: null, content: { not: null } },
  });

  console.log(`Found ${prdsToBackfill.length} Prd row(s) to backfill.`);

  let backfilled = 0;
  for (const prd of prdsToBackfill) {
    await prisma.$transaction(async (tx) => {
      const version = await tx.prdVersion.create({
        data: {
          prdId: prd.id,
          versionNumber: 1,
          // Guarded by the findMany's `content: { not: null }` filter above.
          content: prd.content as string,
          modelId: prd.modelId,
          inputTokens: prd.inputTokens,
          outputTokens: prd.outputTokens,
          generatedAt: prd.generatedAt,
          editedAt: prd.editedAt,
        },
      });

      await tx.prd.update({
        where: { id: prd.id },
        data: { currentVersionId: version.id },
      });
    });

    backfilled++;
    console.log(`  [${backfilled}/${prdsToBackfill.length}] backfilled Prd ${prd.id}`);
  }

  console.log(`Done. Backfilled ${backfilled} Prd row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
