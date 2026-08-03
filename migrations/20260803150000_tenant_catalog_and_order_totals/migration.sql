-- Tenant ownership for the catalog and auditable, server-calculated order totals.
ALTER TABLE "categories" ADD COLUMN "admin_id" UUID;
ALTER TABLE "ingredients" ADD COLUMN "admin_id" UUID;

DO $$
DECLARE
  first_admin UUID;
  tenant RECORD;
  source_category RECORD;
  source_ingredient RECORD;
  cloned_id INTEGER;
BEGIN
  SELECT "id" INTO first_admin FROM "admins" ORDER BY "created_at", "id" LIMIT 1;

  IF first_admin IS NULL AND (
    EXISTS (SELECT 1 FROM "categories") OR EXISTS (SELECT 1 FROM "ingredients")
  ) THEN
    RAISE EXCEPTION 'Cannot assign legacy catalog rows because no restaurant admin exists';
  END IF;

  IF first_admin IS NOT NULL THEN
    UPDATE "categories" SET "admin_id" = first_admin WHERE "admin_id" IS NULL;
    UPDATE "ingredients" SET "admin_id" = first_admin WHERE "admin_id" IS NULL;

    FOR tenant IN SELECT "id" FROM "admins" WHERE "id" <> first_admin LOOP
      FOR source_category IN
        SELECT "id", "name_en", "name_ar", "sort_order", "created_at"
        FROM "categories" WHERE "admin_id" = first_admin
      LOOP
        INSERT INTO "categories" ("admin_id", "name_en", "name_ar", "sort_order", "created_at")
        VALUES (tenant."id", source_category."name_en", source_category."name_ar", source_category."sort_order", source_category."created_at")
        RETURNING "id" INTO cloned_id;

        UPDATE "menus"
        SET "category_id" = cloned_id
        WHERE "user_id" = tenant."id" AND "category_id" = source_category."id";
      END LOOP;

      FOR source_ingredient IN
        SELECT "id", "name_en", "name_ar", "created_at"
        FROM "ingredients" WHERE "admin_id" = first_admin
      LOOP
        INSERT INTO "ingredients" ("admin_id", "name_en", "name_ar", "created_at")
        VALUES (tenant."id", source_ingredient."name_en", source_ingredient."name_ar", source_ingredient."created_at")
        RETURNING "id" INTO cloned_id;

        UPDATE "menu_ingredients" AS mi
        SET "ingredient_id" = cloned_id
        FROM "menus" AS m
        WHERE mi."menu_id" = m."id"
          AND m."user_id" = tenant."id"
          AND mi."ingredient_id" = source_ingredient."id";
      END LOOP;
    END LOOP;
  END IF;
END $$;

ALTER TABLE "categories" ALTER COLUMN "admin_id" SET NOT NULL;
ALTER TABLE "ingredients" ALTER COLUMN "admin_id" SET NOT NULL;

CREATE UNIQUE INDEX "categories_admin_id_name_en_key" ON "categories"("admin_id", "name_en");
CREATE INDEX "categories_admin_id_idx" ON "categories"("admin_id");
CREATE UNIQUE INDEX "ingredients_admin_id_name_en_key" ON "ingredients"("admin_id", "name_en");
CREATE INDEX "ingredients_admin_id_idx" ON "ingredients"("admin_id");

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingredients"
  ADD CONSTRAINT "ingredients_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD COLUMN "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vat" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "service_charge" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "promotion_id" UUID,
  ADD COLUMN "promotion_code" TEXT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD COLUMN "customizations" JSONB DEFAULT '{}';
