-- AUTH-001: phone-based identity — User keyed on phone, OtpCode table added.
-- Expand/contract in one migration:
--   1. expand   — new enums/columns/table (nullable or defaulted first)
--   2. backfill — deterministic phones for every existing row (seeded admin
--                gets the documented dev phone `09120000000`)
--   3. contract — phone NOT NULL + unique, email/passwordHash relaxed to
--                nullable (password stays only for the admin login path)

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'PHONE_CHANGE');

-- AlterTable (expand: RefreshToken session metadata for AUTH-006)
ALTER TABLE "RefreshToken" ADD COLUMN     "deviceLabel" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "userAgent" TEXT;

-- AlterTable (expand: User identity columns — phone nullable until backfilled)
ALTER TABLE "User" ADD COLUMN     "accountRoles" "AccountRole"[] DEFAULT ARRAY[]::"AccountRole"[],
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_phone_createdAt_idx" ON "OtpCode"("phone", "createdAt");

-- CreateIndex (raw SQL — not expressible in schema.prisma):
-- one *active* OTP per phone+purpose. Expired-but-unconsumed rows keep the
-- slot until the prune job removes them; `now()` cannot appear in an index
-- predicate, so only `consumedAt IS NULL` is part of the filter (plan §12).
CREATE UNIQUE INDEX "OtpCode_phone_purpose_active_key" ON "OtpCode"("phone", "purpose") WHERE "consumedAt" IS NULL;

-- Backfill: the two template-seed rows get fixed phones (mirrored in seed.ts);
-- every other legacy row gets a distinct `09000000NNN` placeholder.
UPDATE "User" SET "phone" = '09120000000' WHERE "phone" IS NULL AND "email" = 'admin@monorepo.local';
UPDATE "User" SET "phone" = '09120000001' WHERE "phone" IS NULL AND "email" = 'user@monorepo.local';
WITH numbered AS (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") + 2 AS n
    FROM "User"
    WHERE "phone" IS NULL
)
UPDATE "User" AS u
SET "phone" = '09' || lpad(n.n::text, 9, '0')
FROM numbered n
WHERE u."id" = n."id";

-- AlterTable (contract: tighten phone, relax email/passwordHash)
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");
