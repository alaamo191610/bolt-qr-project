CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uploads_filename_key" ON "uploads"("filename");
CREATE INDEX "uploads_organization_id_created_at_idx" ON "uploads"("organization_id", "created_at");
CREATE INDEX "uploads_uploaded_by_user_id_created_at_idx" ON "uploads"("uploaded_by_user_id", "created_at");

ALTER TABLE "uploads"
  ADD CONSTRAINT "uploads_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "uploads"
  ADD CONSTRAINT "uploads_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "order_tracking_tokens" (
    "id" UUID NOT NULL,
    "order_id" INTEGER NOT NULL,
    "organization_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "jti" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tracking_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_tracking_tokens_order_id_key" ON "order_tracking_tokens"("order_id");
CREATE UNIQUE INDEX "order_tracking_tokens_jti_key" ON "order_tracking_tokens"("jti");
CREATE INDEX "order_tracking_tokens_scope_idx"
  ON "order_tracking_tokens"("organization_id", "admin_id", "order_id", "expires_at");

ALTER TABLE "order_tracking_tokens"
  ADD CONSTRAINT "order_tracking_tokens_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_tracking_tokens"
  ADD CONSTRAINT "order_tracking_tokens_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_tracking_tokens"
  ADD CONSTRAINT "order_tracking_tokens_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admins"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
