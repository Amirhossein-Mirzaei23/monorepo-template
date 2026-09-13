-- DEAL-005: the seller completed-deals counter, atomically incremented on
-- every COMPLETED deal (DealsService completion handler). Expand-only; the
-- rest of the seller metrics columns belong to PROF-005's rollup.
ALTER TABLE "Profile" ADD COLUMN "successfulDeals" INTEGER NOT NULL DEFAULT 0;
