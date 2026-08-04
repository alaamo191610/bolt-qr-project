-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PosDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "TillShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('PAY_IN', 'PAY_OUT', 'CASH_DROP', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DiningSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'EXTERNAL_CARD', 'HOUSE_ACCOUNT', 'COMPLIMENTARY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('QR', 'POS', 'WAITER', 'ONLINE', 'KIOSK', 'API');

-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "default_branch_id" UUID,
ADD COLUMN     "organization_id" UUID;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "check_id" UUID,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'QR',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "tables" ADD COLUMN     "branch_id" UUID;

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Amman',
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "next_check_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "pin_hash" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_branch_roles" (
    "employee_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_branch_roles_pkey" PRIMARY KEY ("employee_id","branch_id","role_id")
);

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "status" "PosDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registers" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "device_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_shifts" (
    "id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "TillShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opening_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expected_cash" DECIMAL(12,2),
    "counted_cash" DECIMAL(12,2),
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "till_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "till_shift_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_sessions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" INTEGER,
    "opened_by_employee_id" UUID,
    "status" "DiningSessionStatus" NOT NULL DEFAULT 'OPEN',
    "guest_count" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dining_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "dining_session_id" UUID,
    "number" INTEGER NOT NULL,
    "status" "CheckStatus" NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "service_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "opened_by_employee_id" UUID,
    "closed_by_employee_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "captured_by_employee_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "provider" TEXT,
    "provider_reference" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "approved_by_employee_id" UUID,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "actor_admin_id" UUID,
    "actor_employee_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_idempotency_keys" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- Backfill every existing restaurant into an isolated organization and main branch.
-- Reusing the admin UUID makes this deterministic and safe to rerun in restored clones.
INSERT INTO "organizations" ("id", "name", "slug", "active", "created_at", "updated_at")
SELECT
    a."id",
    COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), NULLIF(SPLIT_PART(a."email", '@', 1), ''), 'Restaurant'),
    'org-' || REPLACE(a."id"::text, '-', ''),
    true,
    a."created_at",
    CURRENT_TIMESTAMP
FROM "admins" a
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "branches" ("id", "organization_id", "code", "name", "timezone", "currency", "active", "created_at", "updated_at")
SELECT
    a."id",
    a."id",
    'MAIN',
    COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), 'Main Branch'),
    'Asia/Amman',
    'JOD',
    true,
    a."created_at",
    CURRENT_TIMESTAMP
FROM "admins" a
ON CONFLICT ("id") DO NOTHING;

UPDATE "admins"
SET "organization_id" = "id", "default_branch_id" = "id"
WHERE "organization_id" IS NULL OR "default_branch_id" IS NULL;

UPDATE "categories" SET "branch_id" = "admin_id" WHERE "branch_id" IS NULL;
UPDATE "ingredients" SET "branch_id" = "admin_id" WHERE "branch_id" IS NULL;
UPDATE "menus" SET "branch_id" = "user_id" WHERE "branch_id" IS NULL AND "user_id" IS NOT NULL;
UPDATE "tables" SET "branch_id" = "admin_id" WHERE "branch_id" IS NULL AND "admin_id" IS NOT NULL;
UPDATE "orders" SET "branch_id" = "admin_id" WHERE "branch_id" IS NULL AND "admin_id" IS NOT NULL;
UPDATE "promotions" SET "branch_id" = "admin_id" WHERE "branch_id" IS NULL;

-- Seed immutable role templates. Employee assignments remain explicit per branch.
INSERT INTO "pos_roles" ("id", "organization_id", "code", "name", "permissions", "system")
SELECT
    (
      SUBSTR(MD5(o."id"::text || ':' || role_data.code), 1, 8) || '-' ||
      SUBSTR(MD5(o."id"::text || ':' || role_data.code), 9, 4) || '-' ||
      SUBSTR(MD5(o."id"::text || ':' || role_data.code), 13, 4) || '-' ||
      SUBSTR(MD5(o."id"::text || ':' || role_data.code), 17, 4) || '-' ||
      SUBSTR(MD5(o."id"::text || ':' || role_data.code), 21, 12)
    )::uuid,
    o."id",
    role_data.code,
    role_data.name,
    role_data.permissions,
    true
FROM "organizations" o
CROSS JOIN (VALUES
    ('OWNER', 'Owner', ARRAY['pos:*']::text[]),
    ('MANAGER', 'Manager', ARRAY['pos:read', 'check:write', 'payment:write', 'refund:write', 'shift:manage', 'employee:manage']::text[]),
    ('CASHIER', 'Cashier', ARRAY['pos:read', 'check:write', 'payment:write', 'shift:own']::text[]),
    ('WAITER', 'Waiter', ARRAY['pos:read', 'check:write', 'table:manage']::text[])
) AS role_data(code, name, permissions)
ON CONFLICT DO NOTHING;

-- Financial and concurrency invariants belong in the database as well as the API.
ALTER TABLE "branches" ADD CONSTRAINT "branches_next_check_number_positive" CHECK ("next_check_number" > 0);
ALTER TABLE "till_shifts" ADD CONSTRAINT "till_shifts_cash_nonnegative" CHECK (
    "opening_cash" >= 0 AND COALESCE("expected_cash", 0) >= 0 AND COALESCE("counted_cash", 0) >= 0
);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_guest_count_positive" CHECK ("guest_count" > 0);
ALTER TABLE "checks" ADD CONSTRAINT "checks_amounts_nonnegative" CHECK (
    "subtotal" >= 0 AND "discount" >= 0 AND "vat" >= 0 AND "service_charge" >= 0 AND
    "delivery_fee" >= 0 AND "tip" >= 0 AND "total" >= 0 AND "paid" >= 0 AND "balance" >= 0
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0 AND "tip" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);

CREATE UNIQUE INDEX "till_shifts_one_open_per_register_idx"
ON "till_shifts" ("register_id") WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "dining_sessions_one_open_per_table_idx"
ON "dining_sessions" ("branch_id", "table_id") WHERE "status" = 'OPEN' AND "table_id" IS NOT NULL;

CREATE UNIQUE INDEX "payments_provider_reference_key"
ON "payments" ("provider", "provider_reference") WHERE "provider" IS NOT NULL AND "provider_reference" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_active_idx" ON "organizations"("active");

-- CreateIndex
CREATE INDEX "branches_organization_id_active_idx" ON "branches"("organization_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "branches"("organization_id", "code");

-- CreateIndex
CREATE INDEX "employees_organization_id_status_idx" ON "employees"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_email_key" ON "employees"("organization_id", "email");

-- CreateIndex
CREATE INDEX "pos_roles_organization_id_idx" ON "pos_roles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_roles_organization_id_code_key" ON "pos_roles"("organization_id", "code");

-- CreateIndex
CREATE INDEX "employee_branch_roles_branch_id_role_id_idx" ON "employee_branch_roles"("branch_id", "role_id");

-- CreateIndex
CREATE INDEX "employee_branch_roles_employee_id_branch_id_idx" ON "employee_branch_roles"("employee_id", "branch_id");

-- CreateIndex
CREATE INDEX "pos_devices_branch_id_status_idx" ON "pos_devices"("branch_id", "status");

-- CreateIndex
CREATE INDEX "pos_devices_last_seen_at_idx" ON "pos_devices"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_branch_id_code_key" ON "pos_devices"("branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "registers_device_id_key" ON "registers"("device_id");

-- CreateIndex
CREATE INDEX "registers_branch_id_active_idx" ON "registers"("branch_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "registers_branch_id_code_key" ON "registers"("branch_id", "code");

-- CreateIndex
CREATE INDEX "till_shifts_register_id_status_opened_at_idx" ON "till_shifts"("register_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "till_shifts_employee_id_opened_at_idx" ON "till_shifts"("employee_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_movements_till_shift_id_created_at_idx" ON "cash_movements"("till_shift_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_employee_id_created_at_idx" ON "cash_movements"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "dining_sessions_branch_id_status_opened_at_idx" ON "dining_sessions"("branch_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "dining_sessions_table_id_status_idx" ON "dining_sessions"("table_id", "status");

-- CreateIndex
CREATE INDEX "checks_branch_id_status_opened_at_idx" ON "checks"("branch_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "checks_dining_session_id_idx" ON "checks"("dining_session_id");

-- CreateIndex
CREATE INDEX "checks_opened_by_employee_id_opened_at_idx" ON "checks"("opened_by_employee_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "checks_branch_id_number_key" ON "checks"("branch_id", "number");

-- CreateIndex
CREATE INDEX "payments_check_id_status_created_at_idx" ON "payments"("check_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "payments_branch_id_created_at_idx" ON "payments"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_provider_provider_reference_idx" ON "payments"("provider", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_branch_id_idempotency_key_key" ON "payments"("branch_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_payment_id_status_created_at_idx" ON "refunds"("payment_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_payment_id_idempotency_key_key" ON "refunds"("payment_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_branch_id_created_at_idx" ON "audit_events"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_admin_id_created_at_idx" ON "audit_events"("actor_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_employee_id_created_at_idx" ON "audit_events"("actor_employee_id", "created_at");

-- CreateIndex
CREATE INDEX "api_idempotency_keys_expires_at_idx" ON "api_idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_keys_branch_id_scope_key_key" ON "api_idempotency_keys"("branch_id", "scope", "key");

-- CreateIndex
CREATE INDEX "admins_organization_id_idx" ON "admins"("organization_id");

-- CreateIndex
CREATE INDEX "admins_default_branch_id_idx" ON "admins"("default_branch_id");

-- CreateIndex
CREATE INDEX "categories_branch_id_idx" ON "categories"("branch_id");

-- CreateIndex
CREATE INDEX "ingredients_branch_id_idx" ON "ingredients"("branch_id");

-- CreateIndex
CREATE INDEX "menus_branch_id_idx" ON "menus"("branch_id");

-- CreateIndex
CREATE INDEX "menus_branch_id_available_deleted_at_idx" ON "menus"("branch_id", "available", "deleted_at");

-- CreateIndex
CREATE INDEX "orders_branch_id_created_at_idx" ON "orders"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_branch_id_status_created_at_idx" ON "orders"("branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_check_id_created_at_idx" ON "orders"("check_id", "created_at");

-- CreateIndex
CREATE INDEX "promotions_branch_id_active_idx" ON "promotions"("branch_id", "active");

-- CreateIndex
CREATE INDEX "tables_branch_id_status_idx" ON "tables"("branch_id", "status");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_default_branch_id_fkey" FOREIGN KEY ("default_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_roles" ADD CONSTRAINT "pos_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_roles" ADD CONSTRAINT "employee_branch_roles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_roles" ADD CONSTRAINT "employee_branch_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_roles" ADD CONSTRAINT "employee_branch_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "pos_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registers" ADD CONSTRAINT "registers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registers" ADD CONSTRAINT "registers_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "pos_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_shifts" ADD CONSTRAINT "till_shifts_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_shifts" ADD CONSTRAINT "till_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_till_shift_id_fkey" FOREIGN KEY ("till_shift_id") REFERENCES "till_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_opened_by_employee_id_fkey" FOREIGN KEY ("opened_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_dining_session_id_fkey" FOREIGN KEY ("dining_session_id") REFERENCES "dining_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_opened_by_employee_id_fkey" FOREIGN KEY ("opened_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_closed_by_employee_id_fkey" FOREIGN KEY ("closed_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_captured_by_employee_id_fkey" FOREIGN KEY ("captured_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_employee_id_fkey" FOREIGN KEY ("approved_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_employee_id_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
