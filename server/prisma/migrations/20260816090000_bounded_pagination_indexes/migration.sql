-- Support deterministic tenant-scoped order pagination and bounded analytics windows.
CREATE INDEX "orders_organization_id_created_at_id_idx"
ON "orders"("organization_id", "created_at", "id");
CREATE INDEX "orders_organization_id_status_created_at_id_idx"
ON "orders"("organization_id", "status", "created_at", "id");

-- Support deterministic platform restaurant pagination and subscription counts.
CREATE INDEX "admins_created_at_id_idx" ON "admins"("created_at", "id");
CREATE INDEX "admins_subscription_status_subscription_plan_idx"
ON "admins"("subscription_status", "subscription_plan");
CREATE INDEX "admins_subscription_plan_created_at_id_idx"
ON "admins"("subscription_plan", "created_at", "id");

-- Promotions are not subscription-count bounded, so their list uses the same seek pattern.
CREATE INDEX "promotions_organization_id_created_at_id_idx"
ON "promotions"("organization_id", "created_at", "id");
