-- Table QR capabilities are bearer secrets. Store only the SHA-256 hash and
-- bind each record to one table and organization. Rotation increments version
-- so previously issued short-lived sessions can be rejected immediately.

CREATE TABLE "table_capabilities" (
    "id" UUID NOT NULL,
    "table_id" INTEGER NOT NULL,
    "organization_id" UUID NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_capabilities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "table_capabilities_version_check" CHECK ("version" > 0),
    CONSTRAINT "table_capabilities_secret_hash_check" CHECK ("secret_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "table_capabilities_table_id_key"
  ON "table_capabilities"("table_id");
CREATE UNIQUE INDEX "table_capabilities_secret_hash_key"
  ON "table_capabilities"("secret_hash");
CREATE UNIQUE INDEX "table_capabilities_table_id_organization_id_key"
  ON "table_capabilities"("table_id", "organization_id");
CREATE INDEX "table_capabilities_organization_id_active_idx"
  ON "table_capabilities"("organization_id", "active");
CREATE UNIQUE INDEX "tables_id_organization_id_key"
  ON "tables"("id", "organization_id");

ALTER TABLE "table_capabilities" ADD CONSTRAINT "table_capabilities_table_id_fkey"
  FOREIGN KEY ("table_id", "organization_id") REFERENCES "tables"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_capabilities" ADD CONSTRAINT "table_capabilities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
