-- Expand-only tenant ownership migration.
-- Legacy admin_id/user_id and branch_id columns remain the compatibility source
-- until the backfill, verify, enforce, and contract phases are separately approved.

ALTER TABLE "categories" ADD COLUMN "organization_id" UUID;
ALTER TABLE "ingredients" ADD COLUMN "organization_id" UUID;
ALTER TABLE "menus" ADD COLUMN "organization_id" UUID;
ALTER TABLE "tables" ADD COLUMN "organization_id" UUID;
ALTER TABLE "orders" ADD COLUMN "organization_id" UUID;
ALTER TABLE "promotions" ADD COLUMN "organization_id" UUID;
ALTER TABLE "modifier_groups" ADD COLUMN "organization_id" UUID;

CREATE INDEX "categories_organization_id_idx" ON "categories"("organization_id");
CREATE INDEX "ingredients_organization_id_idx" ON "ingredients"("organization_id");
CREATE INDEX "menus_organization_id_idx" ON "menus"("organization_id");
CREATE INDEX "tables_organization_id_idx" ON "tables"("organization_id");
CREATE INDEX "orders_organization_id_idx" ON "orders"("organization_id");
CREATE INDEX "promotions_organization_id_idx" ON "promotions"("organization_id");
CREATE INDEX "modifier_groups_organization_id_idx" ON "modifier_groups"("organization_id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
