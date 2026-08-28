-- AlterTable
ALTER TABLE "Prd" ADD COLUMN     "currentVersionId" TEXT;

-- CreateTable
CREATE TABLE "PrdVersion" (
    "id" TEXT NOT NULL,
    "prdId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "modelId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "generatedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrdVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrdVersion_prdId_idx" ON "PrdVersion"("prdId");

-- CreateIndex
CREATE UNIQUE INDEX "PrdVersion_prdId_versionNumber_key" ON "PrdVersion"("prdId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Prd_currentVersionId_key" ON "Prd"("currentVersionId");

-- AddForeignKey
ALTER TABLE "Prd" ADD CONSTRAINT "Prd_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PrdVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrdVersion" ADD CONSTRAINT "PrdVersion_prdId_fkey" FOREIGN KEY ("prdId") REFERENCES "Prd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

