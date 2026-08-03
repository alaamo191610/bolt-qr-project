-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'percent',
    "value" DECIMAL(10,2) NOT NULL,
    "min_order" DECIMAL(10,2),
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ,
    "usage_limit" INTEGER,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "applies_to" TEXT NOT NULL DEFAULT 'global',
    "table_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promotions_admin_id_code_key" ON "promotions"("admin_id", "code");
CREATE INDEX "promotions_admin_id_active_idx" ON "promotions"("admin_id", "active");

ALTER TABLE "promotions"
ADD CONSTRAINT "promotions_admin_id_fkey"
FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotions"
ADD CONSTRAINT "promotions_table_id_fkey"
FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
