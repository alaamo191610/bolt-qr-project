-- Persist the individually issued public table-session identity so the
-- accepted three-open-order policy can be enforced durably across processes.

ALTER TABLE "orders" ADD COLUMN "table_session_id" UUID;

CREATE INDEX "orders_organization_id_table_id_table_session_id_status_idx"
  ON "orders"("organization_id", "table_id", "table_session_id", "status");
