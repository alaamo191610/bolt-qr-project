-- Final tenant enforcement is intentionally fail-closed. The migration cannot
-- apply while any legacy ownership or relationship issue remains.
DO $$
DECLARE
  issue_count BIGINT;
BEGIN
  WITH issues AS (
    SELECT COUNT(*) AS count FROM "categories" c
      LEFT JOIN "admins" a ON a."id" = c."admin_id"
      LEFT JOIN "branches" b ON b."id" = c."branch_id"
      LEFT JOIN "organizations" o ON o."id" = c."organization_id"
      WHERE c."organization_id" IS NULL OR o."active" IS NOT TRUE
        OR a."organization_id" IS DISTINCT FROM c."organization_id"
        OR (c."branch_id" IS NOT NULL AND b."organization_id" IS DISTINCT FROM c."organization_id")
    UNION ALL
    SELECT COUNT(*) FROM "ingredients" i
      LEFT JOIN "admins" a ON a."id" = i."admin_id"
      LEFT JOIN "branches" b ON b."id" = i."branch_id"
      LEFT JOIN "organizations" o ON o."id" = i."organization_id"
      WHERE i."organization_id" IS NULL OR o."active" IS NOT TRUE
        OR a."organization_id" IS DISTINCT FROM i."organization_id"
        OR (i."branch_id" IS NOT NULL AND b."organization_id" IS DISTINCT FROM i."organization_id")
    UNION ALL
    SELECT COUNT(*) FROM "menus" m
      LEFT JOIN "admins" a ON a."id" = m."user_id"
      LEFT JOIN "branches" b ON b."id" = m."branch_id"
      LEFT JOIN "organizations" o ON o."id" = m."organization_id"
      WHERE m."organization_id" IS NULL OR o."active" IS NOT TRUE
        OR a."organization_id" IS DISTINCT FROM m."organization_id"
        OR (m."branch_id" IS NOT NULL AND b."organization_id" IS DISTINCT FROM m."organization_id")
    UNION ALL
    SELECT COUNT(*) FROM "tables" t
      LEFT JOIN "admins" a ON a."id" = t."admin_id"
      LEFT JOIN "branches" b ON b."id" = t."branch_id"
      LEFT JOIN "organizations" o ON o."id" = t."organization_id"
      WHERE t."organization_id" IS NULL OR o."active" IS NOT TRUE
        OR a."organization_id" IS DISTINCT FROM t."organization_id"
        OR (t."branch_id" IS NOT NULL AND b."organization_id" IS DISTINCT FROM t."organization_id")
    UNION ALL
    SELECT COUNT(*) FROM "orders" r
      LEFT JOIN "admins" a ON a."id" = r."admin_id"
      LEFT JOIN "branches" b ON b."id" = r."branch_id"
      LEFT JOIN "organizations" o ON o."id" = r."organization_id"
      WHERE r."organization_id" IS NULL OR o."active" IS NOT TRUE
        OR a."organization_id" IS DISTINCT FROM r."organization_id"
        OR (r."branch_id" IS NOT NULL AND b."organization_id" IS DISTINCT FROM r."organization_id")
    UNION ALL
    SELECT COUNT(*) FROM "promotions" p
      LEFT JOIN "admins" a ON a."id" = p."admin_id"
      LEFT JOIN "branches" b ON b."id" = p."branch_id"
      LEFT JOIN "organizations" o ON o."id" = p."organization_id"
      WHERE p."organization_id" IS NULL OR o."active" IS NOT TRUE
        OR a."organization_id" IS DISTINCT FROM p."organization_id"
        OR (p."branch_id" IS NOT NULL AND b."organization_id" IS DISTINCT FROM p."organization_id")
    UNION ALL
    SELECT COUNT(*) FROM "modifier_groups" g
      LEFT JOIN "organizations" o ON o."id" = g."organization_id"
      WHERE g."organization_id" IS NULL OR o."active" IS NOT TRUE
    UNION ALL
    SELECT COUNT(*) FROM "menus" m JOIN "categories" c ON c."id" = m."category_id"
      WHERE m."organization_id" IS DISTINCT FROM c."organization_id"
    UNION ALL
    SELECT COUNT(*) FROM "menu_ingredients" mi
      JOIN "menus" m ON m."id" = mi."menu_id"
      JOIN "ingredients" i ON i."id" = mi."ingredient_id"
      WHERE m."organization_id" IS DISTINCT FROM i."organization_id"
    UNION ALL
    SELECT COUNT(*) FROM "menu_modifier_groups" mmg
      JOIN "menus" m ON m."id" = mmg."menu_id"
      JOIN "modifier_groups" g ON g."id" = mmg."group_id"
      WHERE m."organization_id" IS DISTINCT FROM g."organization_id"
    UNION ALL
    SELECT COUNT(*) FROM "orders" r JOIN "tables" t ON t."id" = r."table_id"
      WHERE r."organization_id" IS DISTINCT FROM t."organization_id"
    UNION ALL
    SELECT COUNT(*) FROM "orders" r JOIN "promotions" p ON p."id" = r."promotion_id"
      WHERE r."organization_id" IS DISTINCT FROM p."organization_id"
    UNION ALL
    SELECT COUNT(*) FROM "promotions" p JOIN "tables" t ON t."id" = p."table_id"
      WHERE p."organization_id" IS DISTINCT FROM t."organization_id"
  )
  SELECT COALESCE(SUM(count), 0) INTO issue_count FROM issues;

  IF issue_count <> 0 THEN
    RAISE EXCEPTION 'Tenant ownership enforcement blocked: % issue(s) remain', issue_count
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

ALTER TABLE "categories" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "ingredients" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "menus" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tables" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "promotions" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "modifier_groups" ALTER COLUMN "organization_id" SET NOT NULL;

-- Organization ownership is now retained when a parent is removed; deleting a
-- tenant-owned root must be an explicit, dependency-aware operation.
ALTER TABLE "categories" DROP CONSTRAINT "categories_organization_id_fkey";
ALTER TABLE "ingredients" DROP CONSTRAINT "ingredients_organization_id_fkey";
ALTER TABLE "menus" DROP CONSTRAINT "menus_organization_id_fkey";
ALTER TABLE "tables" DROP CONSTRAINT "tables_organization_id_fkey";
ALTER TABLE "orders" DROP CONSTRAINT "orders_organization_id_fkey";
ALTER TABLE "promotions" DROP CONSTRAINT "promotions_organization_id_fkey";
ALTER TABLE "modifier_groups" DROP CONSTRAINT "modifier_groups_organization_id_fkey";

ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "admins_id_organization_id_key" ON "admins"("id", "organization_id");
CREATE UNIQUE INDEX "branches_id_organization_id_key" ON "branches"("id", "organization_id");
CREATE UNIQUE INDEX "categories_id_organization_id_key" ON "categories"("id", "organization_id");
CREATE UNIQUE INDEX "ingredients_id_organization_id_key" ON "ingredients"("id", "organization_id");
CREATE UNIQUE INDEX "menus_id_organization_id_key" ON "menus"("id", "organization_id");
CREATE UNIQUE INDEX "orders_id_organization_id_key" ON "orders"("id", "organization_id");
CREATE UNIQUE INDEX "promotions_id_organization_id_key" ON "promotions"("id", "organization_id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_admin_organization_fkey"
  FOREIGN KEY ("admin_id", "organization_id") REFERENCES "admins"("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_branch_organization_fkey"
  FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_admin_organization_fkey"
  FOREIGN KEY ("admin_id", "organization_id") REFERENCES "admins"("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_branch_organization_fkey"
  FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "menus" ADD CONSTRAINT "menus_admin_organization_fkey"
  FOREIGN KEY ("user_id", "organization_id") REFERENCES "admins"("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_branch_organization_fkey"
  FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "tables" ADD CONSTRAINT "tables_admin_organization_fkey"
  FOREIGN KEY ("admin_id", "organization_id") REFERENCES "admins"("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_organization_fkey"
  FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_admin_organization_fkey"
  FOREIGN KEY ("admin_id", "organization_id") REFERENCES "admins"("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_organization_fkey"
  FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_admin_organization_fkey"
  FOREIGN KEY ("admin_id", "organization_id") REFERENCES "admins"("id", "organization_id") ON DELETE CASCADE;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_branch_organization_fkey"
  FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT;

ALTER TABLE "menus" ADD CONSTRAINT "menus_category_organization_fkey"
  FOREIGN KEY ("category_id", "organization_id") REFERENCES "categories"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_organization_fkey"
  FOREIGN KEY ("table_id", "organization_id") REFERENCES "tables"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_organization_fkey"
  FOREIGN KEY ("promotion_id", "organization_id") REFERENCES "promotions"("id", "organization_id") ON DELETE RESTRICT;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_table_organization_fkey"
  FOREIGN KEY ("table_id", "organization_id") REFERENCES "tables"("id", "organization_id") ON DELETE RESTRICT;
