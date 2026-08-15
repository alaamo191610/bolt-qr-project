-- Branch-scoped operational state for public ordering. Existing locations
-- start OPEN to preserve behavior. Table branch backfill is deliberately
-- limited to ownership-consistent admin defaults.

CREATE TYPE "OrderingState" AS ENUM ('OPEN', 'PAUSED', 'CLOSED', 'OVERLOADED');

ALTER TABLE "branches"
  ADD COLUMN "ordering_state" "OrderingState" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "ordering_state_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "tables" AS table_record
SET "branch_id" = admin_record."default_branch_id"
FROM "admins" AS admin_record
JOIN "branches" AS branch_record
  ON branch_record."id" = admin_record."default_branch_id"
 AND branch_record."organization_id" = admin_record."organization_id"
WHERE table_record."branch_id" IS NULL
  AND table_record."admin_id" = admin_record."id"
  AND table_record."organization_id" = admin_record."organization_id";

CREATE INDEX "branches_organization_id_ordering_state_active_idx"
  ON "branches"("organization_id", "ordering_state", "active");
