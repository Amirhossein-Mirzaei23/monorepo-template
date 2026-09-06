-- CreateTable
CREATE TABLE "LotMedia" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotMedia_lotId_sortOrder_idx" ON "LotMedia"("lotId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LotMedia_lotId_mediaAssetId_key" ON "LotMedia"("lotId", "mediaAssetId");

-- AddForeignKey
ALTER TABLE "LotMedia" ADD CONSTRAINT "LotMedia_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotMedia" ADD CONSTRAINT "LotMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
