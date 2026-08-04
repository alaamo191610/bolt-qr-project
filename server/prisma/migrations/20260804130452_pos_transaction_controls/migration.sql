-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- AlterTable
ALTER TABLE "checks" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "status" "OrderItemStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ,
ADD COLUMN     "voided_by_employee_id" UUID;

-- CreateIndex
CREATE INDEX "order_items_order_id_status_idx" ON "order_items"("order_id", "status");

-- CreateIndex
CREATE INDEX "order_items_voided_by_employee_id_voided_at_idx" ON "order_items"("voided_by_employee_id", "voided_at");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_voided_by_employee_id_fkey" FOREIGN KEY ("voided_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend system roles without replacing any restaurant-specific permissions.
UPDATE "pos_roles"
SET "permissions" = ARRAY(SELECT DISTINCT permission FROM UNNEST("permissions" || ARRAY['item:void']) AS permission)
WHERE "system" = true AND "code" IN ('CASHIER', 'WAITER');

UPDATE "pos_roles"
SET "permissions" = ARRAY(SELECT DISTINCT permission FROM UNNEST("permissions" || ARRAY['item:void', 'check:void', 'cash:manage']) AS permission)
WHERE "system" = true AND "code" = 'MANAGER';
