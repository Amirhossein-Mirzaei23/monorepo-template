-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('NEGOTIATING', 'AGREED', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'SELLER_SHIPS', 'BUYER_TRANSPORT', 'CARRIER');

-- CreateEnum
CREATE TYPE "PaymentMethodRecorded" AS ENUM ('CASH', 'CARD_TO_CARD', 'BANK_TRANSFER', 'CHEQUE');

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "offerId" TEXT,
    "conversationId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "deliveryNote" TEXT,
    "paymentMethod" "PaymentMethodRecorded" NOT NULL,
    "paymentTermsNote" TEXT,
    "paidConfirmedByBuyerAt" TIMESTAMP(3),
    "commissionRate" INTEGER NOT NULL DEFAULT 0,
    "commissionAmount" INTEGER,
    "status" "DealStatus" NOT NULL DEFAULT 'NEGOTIATING',
    "cancelReason" TEXT,
    "disputeReason" TEXT,
    "agreedAt" TIMESTAMP(3),
    "paymentPendingAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "DealStatus" NOT NULL,
    "toStatus" "DealStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_code_key" ON "Deal"("code");

-- CreateIndex
CREATE INDEX "Deal_buyerId_updatedAt_idx" ON "Deal"("buyerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Deal_sellerId_updatedAt_idx" ON "Deal"("sellerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "DealEvent_dealId_createdAt_idx" ON "DealEvent"("dealId", "createdAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
