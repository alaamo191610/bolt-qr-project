-- Remove legacy combo groups whose parent menu no longer exists. Their child
-- rows are removed by the existing combo_group_items cascade.
DELETE FROM "combo_groups" AS cg
WHERE NOT EXISTS (
  SELECT 1
  FROM "menus" AS m
  WHERE m."id" = cg."menu_id"
);

-- CreateIndex
CREATE INDEX "combo_group_items_group_id_idx" ON "combo_group_items"("group_id");

-- CreateIndex
CREATE INDEX "combo_group_items_child_menu_id_idx" ON "combo_group_items"("child_menu_id");

-- CreateIndex
CREATE INDEX "combo_groups_menu_id_idx" ON "combo_groups"("menu_id");

-- CreateIndex
CREATE INDEX "menu_ingredients_ingredient_id_idx" ON "menu_ingredients"("ingredient_id");

-- CreateIndex
CREATE INDEX "menu_modifier_groups_group_id_idx" ON "menu_modifier_groups"("group_id");

-- CreateIndex
CREATE INDEX "menus_user_id_available_deleted_at_idx" ON "menus"("user_id", "available", "deleted_at");

-- CreateIndex
CREATE INDEX "menus_category_id_idx" ON "menus"("category_id");

-- CreateIndex
CREATE INDEX "modifier_options_group_id_idx" ON "modifier_options"("group_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_menu_id_idx" ON "order_items"("menu_id");

-- CreateIndex
CREATE INDEX "orders_admin_id_created_at_idx" ON "orders"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_admin_id_status_created_at_idx" ON "orders"("admin_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_table_id_created_at_idx" ON "orders"("table_id", "created_at");

-- AddForeignKey
ALTER TABLE "combo_groups" ADD CONSTRAINT "combo_groups_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
