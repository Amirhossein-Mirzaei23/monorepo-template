-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'EXPIRED', 'SOLD', 'REMOVED');

-- CreateEnum
CREATE TYPE "LotCondition" AS ENUM ('GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY');

-- CreateEnum
CREATE TYPE "LiquidationReason" AS ENUM ('EXCESS_PRODUCTION', 'CANCELLED_ORDER', 'EXPORT_RETURN', 'SEASON_CLEARANCE', 'OVERSTOCK', 'FACTORY_CLOSURE', 'PACKAGING_CHANGE', 'NEAR_EXPIRY', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FIXED', 'NEGOTIABLE');

-- CreateEnum
CREATE TYPE "LotUnit" AS ENUM ('PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER');

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" "LotUnit" NOT NULL DEFAULT 'PIECE',
    "availableQuantity" INTEGER NOT NULL,
    "minOrderQuantity" INTEGER NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "condition" "LotCondition" NOT NULL,
    "liquidationReason" "LiquidationReason" NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "locationHint" TEXT,
    "exactAddress" TEXT,
    "status" "LotStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "featuredAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lot_code_key" ON "Lot"("code");

-- CreateIndex
CREATE INDEX "Lot_status_createdAt_idx" ON "Lot"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lot_status_expiresAt_idx" ON "Lot"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Lot_categoryId_status_idx" ON "Lot"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Lot_city_status_idx" ON "Lot"("city", "status");

-- CreateIndex
CREATE INDEX "Lot_sellerId_status_idx" ON "Lot"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LOT-001 (plan §12): pg_trgm extension + GIN trigram indexes for the public
-- search (`ILIKE '%…%'` on title/description — findPublic `query` filter).
-- Prisma cannot express either statement, so they are hand-written here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Lot_title_trgm_idx" ON "Lot" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Lot_description_trgm_idx" ON "Lot" USING GIN ("description" gin_trgm_ops);
