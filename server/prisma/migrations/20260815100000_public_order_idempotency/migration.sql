-- Durable idempotency for capability-authorized public orders. This is
-- intentionally separate from the POS/API branch-scoped table because QR
-- tables can be organization-owned before branch assignment is enforced.

CREATE UNIQUE INDEX "table_capabilities_id_table_id_organization_id_key"
  ON "table_capabilities"("id", "table_id", "organization_id");
CREATE UNIQUE INDEX "orders_id_table_id_organization_id_key"
  ON "orders"("id", "table_id", "organization_id");

CREATE TABLE "public_order_idempotency" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "table_id" INTEGER NOT NULL,
    "capability_id" UUID NOT NULL,
    "capability_version" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "order_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "public_order_idempotency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "public_order_idempotency_capability_version_check" CHECK ("capability_version" > 0),
    CONSTRAINT "public_order_idempotency_key_check" CHECK ("key" ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT "public_order_idempotency_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "public_order_idempotency_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "public_order_idempotency_order_id_key"
  ON "public_order_idempotency"("order_id");
CREATE UNIQUE INDEX "public_order_idempotency_order_id_table_id_organization_id_key"
  ON "public_order_idempotency"("order_id", "table_id", "organization_id");
CREATE UNIQUE INDEX "public_order_idempotency_capability_id_capability_version_key_key"
  ON "public_order_idempotency"("capability_id", "capability_version", "key");
CREATE INDEX "public_order_idempotency_organization_id_table_id_created_at_idx"
  ON "public_order_idempotency"("organization_id", "table_id", "created_at");
CREATE INDEX "public_order_idempotency_expires_at_idx"
  ON "public_order_idempotency"("expires_at");

ALTER TABLE "public_order_idempotency" ADD CONSTRAINT "public_order_idempotency_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_order_idempotency" ADD CONSTRAINT "public_order_idempotency_table_id_organization_id_fkey"
  FOREIGN KEY ("table_id", "organization_id") REFERENCES "tables"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_order_idempotency" ADD CONSTRAINT "public_order_idempotency_capability_table_organization_fkey"
  FOREIGN KEY ("capability_id", "table_id", "organization_id")
  REFERENCES "table_capabilities"("id", "table_id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_order_idempotency" ADD CONSTRAINT "public_order_idempotency_order_table_organization_fkey"
  FOREIGN KEY ("order_id", "table_id", "organization_id")
  REFERENCES "orders"("id", "table_id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
