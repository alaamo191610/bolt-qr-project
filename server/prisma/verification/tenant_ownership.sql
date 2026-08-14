-- Read-only tenant ownership verification report.
-- Enforcement is ready only when every row reports issue_count = 0.
WITH root_checks AS (
  SELECT
    'categories'::text AS root_name,
    COUNT(*)::bigint AS total_rows,
    COUNT(*) FILTER (WHERE c."organization_id" IS NULL)::bigint AS missing_organization,
    COUNT(*) FILTER (
      WHERE c."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint AS invalid_organization,
    COUNT(*) FILTER (
      WHERE a."id" IS NULL
         OR a."organization_id" IS NULL
         OR c."organization_id" IS DISTINCT FROM a."organization_id"
    )::bigint AS owner_mismatches,
    COUNT(*) FILTER (
      WHERE c."branch_id" IS NOT NULL
        AND (b."id" IS NULL OR c."organization_id" IS DISTINCT FROM b."organization_id")
    )::bigint AS branch_mismatches,
    (
      SELECT COUNT(*)
      FROM "menus" m
      JOIN "categories" linked ON linked."id" = m."category_id"
      WHERE m."organization_id" IS DISTINCT FROM linked."organization_id"
    )::bigint AS link_mismatches
  FROM "categories" c
  LEFT JOIN "admins" a ON a."id" = c."admin_id"
  LEFT JOIN "organizations" org ON org."id" = c."organization_id"
  LEFT JOIN "branches" b ON b."id" = c."branch_id"

  UNION ALL

  SELECT
    'ingredients',
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE i."organization_id" IS NULL)::bigint,
    COUNT(*) FILTER (
      WHERE i."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint,
    COUNT(*) FILTER (
      WHERE a."id" IS NULL
         OR a."organization_id" IS NULL
         OR i."organization_id" IS DISTINCT FROM a."organization_id"
    )::bigint,
    COUNT(*) FILTER (
      WHERE i."branch_id" IS NOT NULL
        AND (b."id" IS NULL OR i."organization_id" IS DISTINCT FROM b."organization_id")
    )::bigint,
    (
      SELECT COUNT(*)
      FROM "menu_ingredients" mi
      JOIN "menus" m ON m."id" = mi."menu_id"
      JOIN "ingredients" linked ON linked."id" = mi."ingredient_id"
      WHERE m."organization_id" IS DISTINCT FROM linked."organization_id"
    )::bigint
  FROM "ingredients" i
  LEFT JOIN "admins" a ON a."id" = i."admin_id"
  LEFT JOIN "organizations" org ON org."id" = i."organization_id"
  LEFT JOIN "branches" b ON b."id" = i."branch_id"

  UNION ALL

  SELECT
    'menus',
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE m."organization_id" IS NULL)::bigint,
    COUNT(*) FILTER (
      WHERE m."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint,
    COUNT(*) FILTER (
      WHERE a."id" IS NULL
         OR a."organization_id" IS NULL
         OR m."organization_id" IS DISTINCT FROM a."organization_id"
    )::bigint,
    COUNT(*) FILTER (
      WHERE m."branch_id" IS NOT NULL
        AND (b."id" IS NULL OR m."organization_id" IS DISTINCT FROM b."organization_id")
    )::bigint,
    (
      (SELECT COUNT(*)
       FROM "menus" parent
       LEFT JOIN "categories" c ON c."id" = parent."category_id"
       WHERE parent."category_id" IS NOT NULL
         AND (c."id" IS NULL OR parent."organization_id" IS DISTINCT FROM c."organization_id"))
      +
      (SELECT COUNT(*)
       FROM "menu_ingredients" mi
       JOIN "menus" parent ON parent."id" = mi."menu_id"
       LEFT JOIN "ingredients" i ON i."id" = mi."ingredient_id"
       WHERE i."id" IS NULL OR parent."organization_id" IS DISTINCT FROM i."organization_id")
      +
      (SELECT COUNT(*)
       FROM "menu_modifier_groups" mmg
       JOIN "menus" parent ON parent."id" = mmg."menu_id"
       LEFT JOIN "modifier_groups" mg ON mg."id" = mmg."group_id"
       WHERE mg."id" IS NULL OR parent."organization_id" IS DISTINCT FROM mg."organization_id")
      +
      (SELECT COUNT(*)
       FROM "combo_groups" cg
       JOIN "menus" parent ON parent."id" = cg."menu_id"
       JOIN "combo_group_items" cgi ON cgi."group_id" = cg."id"
       LEFT JOIN "menus" child ON child."id" = cgi."child_menu_id"
       WHERE child."id" IS NULL OR parent."organization_id" IS DISTINCT FROM child."organization_id")
      +
      (SELECT COUNT(*)
       FROM "menus" parent
       CROSS JOIN LATERAL UNNEST(parent."suggested_items_ids") AS suggested("id")
       LEFT JOIN "menus" child ON child."id" = suggested."id"
       WHERE child."id" IS NULL OR parent."organization_id" IS DISTINCT FROM child."organization_id")
    )::bigint
  FROM "menus" m
  LEFT JOIN "admins" a ON a."id" = m."user_id"
  LEFT JOIN "organizations" org ON org."id" = m."organization_id"
  LEFT JOIN "branches" b ON b."id" = m."branch_id"

  UNION ALL

  SELECT
    'tables',
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE t."organization_id" IS NULL)::bigint,
    COUNT(*) FILTER (
      WHERE t."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint,
    COUNT(*) FILTER (
      WHERE a."id" IS NULL
         OR a."organization_id" IS NULL
         OR t."organization_id" IS DISTINCT FROM a."organization_id"
    )::bigint,
    COUNT(*) FILTER (
      WHERE t."branch_id" IS NOT NULL
        AND (b."id" IS NULL OR t."organization_id" IS DISTINCT FROM b."organization_id")
    )::bigint,
    (
      (SELECT COUNT(*)
       FROM "orders" o
       JOIN "tables" linked ON linked."id" = o."table_id"
       WHERE o."organization_id" IS DISTINCT FROM linked."organization_id")
      +
      (SELECT COUNT(*)
       FROM "promotions" p
       JOIN "tables" linked ON linked."id" = p."table_id"
       WHERE p."organization_id" IS DISTINCT FROM linked."organization_id")
    )::bigint
  FROM "tables" t
  LEFT JOIN "admins" a ON a."id" = t."admin_id"
  LEFT JOIN "organizations" org ON org."id" = t."organization_id"
  LEFT JOIN "branches" b ON b."id" = t."branch_id"

  UNION ALL

  SELECT
    'orders',
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE o."organization_id" IS NULL)::bigint,
    COUNT(*) FILTER (
      WHERE o."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint,
    COUNT(*) FILTER (
      WHERE a."id" IS NULL
         OR a."organization_id" IS NULL
         OR o."organization_id" IS DISTINCT FROM a."organization_id"
    )::bigint,
    COUNT(*) FILTER (
      WHERE o."branch_id" IS NOT NULL
        AND (b."id" IS NULL OR o."organization_id" IS DISTINCT FROM b."organization_id")
    )::bigint,
    (
      (SELECT COUNT(*)
       FROM "orders" linked
       JOIN "tables" t ON t."id" = linked."table_id"
       WHERE linked."organization_id" IS DISTINCT FROM t."organization_id")
      +
      (SELECT COUNT(*)
       FROM "orders" linked
       JOIN "promotions" p ON p."id" = linked."promotion_id"
       WHERE linked."organization_id" IS DISTINCT FROM p."organization_id")
    )::bigint
  FROM "orders" o
  LEFT JOIN "admins" a ON a."id" = o."admin_id"
  LEFT JOIN "organizations" org ON org."id" = o."organization_id"
  LEFT JOIN "branches" b ON b."id" = o."branch_id"

  UNION ALL

  SELECT
    'promotions',
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE p."organization_id" IS NULL)::bigint,
    COUNT(*) FILTER (
      WHERE p."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint,
    COUNT(*) FILTER (
      WHERE a."id" IS NULL
         OR a."organization_id" IS NULL
         OR p."organization_id" IS DISTINCT FROM a."organization_id"
    )::bigint,
    COUNT(*) FILTER (
      WHERE p."branch_id" IS NOT NULL
        AND (b."id" IS NULL OR p."organization_id" IS DISTINCT FROM b."organization_id")
    )::bigint,
    (
      (SELECT COUNT(*)
       FROM "promotions" linked
       JOIN "tables" t ON t."id" = linked."table_id"
       WHERE linked."organization_id" IS DISTINCT FROM t."organization_id")
      +
      (SELECT COUNT(*)
       FROM "orders" o
       JOIN "promotions" linked ON linked."id" = o."promotion_id"
       WHERE o."organization_id" IS DISTINCT FROM linked."organization_id")
    )::bigint
  FROM "promotions" p
  LEFT JOIN "admins" a ON a."id" = p."admin_id"
  LEFT JOIN "organizations" org ON org."id" = p."organization_id"
  LEFT JOIN "branches" b ON b."id" = p."branch_id"

  UNION ALL

  SELECT
    'modifier_groups',
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE mg."organization_id" IS NULL)::bigint,
    COUNT(*) FILTER (
      WHERE mg."organization_id" IS NOT NULL AND (org."id" IS NULL OR org."active" IS NOT TRUE)
    )::bigint,
    0::bigint,
    0::bigint,
    (
      SELECT COUNT(*)
      FROM "menu_modifier_groups" mmg
      JOIN "menus" m ON m."id" = mmg."menu_id"
      JOIN "modifier_groups" linked ON linked."id" = mmg."group_id"
      WHERE m."organization_id" IS DISTINCT FROM linked."organization_id"
    )::bigint
  FROM "modifier_groups" mg
  LEFT JOIN "organizations" org ON org."id" = mg."organization_id"
)
SELECT
  root_name,
  total_rows,
  missing_organization,
  invalid_organization,
  owner_mismatches,
  branch_mismatches,
  link_mismatches,
  (
    missing_organization
    + invalid_organization
    + owner_mismatches
    + branch_mismatches
    + link_mismatches
  )::bigint AS issue_count,
  (
    missing_organization
    + invalid_organization
    + owner_mismatches
    + branch_mismatches
    + link_mismatches
  ) = 0 AS enforcement_ready
FROM root_checks
ORDER BY root_name;
