-- Backfill direct organization ownership only when the legacy ownership source
-- resolves to exactly one tenant. The migration fails closed on unresolved,
-- orphaned, or cross-organization rows; it never guesses ownership.

CREATE TEMP TABLE tenant_ownership_backfill_errors (
    root_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'categories', c."id"::text,
    CASE
      WHEN a."id" IS NULL OR a."organization_id" IS NULL THEN 'missing admin organization'
      WHEN c."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id") THEN 'branch belongs to another or missing organization'
      ELSE 'organization_id conflicts with admin organization'
    END
FROM "categories" c
LEFT JOIN "admins" a ON a."id" = c."admin_id"
LEFT JOIN "branches" b ON b."id" = c."branch_id"
WHERE a."id" IS NULL
   OR a."organization_id" IS NULL
   OR (c."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id"))
   OR (c."organization_id" IS NOT NULL AND c."organization_id" <> a."organization_id");

INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'ingredients', i."id"::text,
    CASE
      WHEN a."id" IS NULL OR a."organization_id" IS NULL THEN 'missing admin organization'
      WHEN i."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id") THEN 'branch belongs to another or missing organization'
      ELSE 'organization_id conflicts with admin organization'
    END
FROM "ingredients" i
LEFT JOIN "admins" a ON a."id" = i."admin_id"
LEFT JOIN "branches" b ON b."id" = i."branch_id"
WHERE a."id" IS NULL
   OR a."organization_id" IS NULL
   OR (i."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id"))
   OR (i."organization_id" IS NOT NULL AND i."organization_id" <> a."organization_id");

INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'menus', m."id"::text,
    CASE
      WHEN a."id" IS NULL OR a."organization_id" IS NULL THEN 'missing menu owner organization'
      WHEN m."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id") THEN 'branch belongs to another or missing organization'
      ELSE 'organization_id conflicts with menu owner organization'
    END
FROM "menus" m
LEFT JOIN "admins" a ON a."id" = m."user_id"
LEFT JOIN "branches" b ON b."id" = m."branch_id"
WHERE a."id" IS NULL
   OR a."organization_id" IS NULL
   OR (m."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id"))
   OR (m."organization_id" IS NOT NULL AND m."organization_id" <> a."organization_id");

INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'tables', t."id"::text,
    CASE
      WHEN a."id" IS NULL OR a."organization_id" IS NULL THEN 'missing admin organization'
      WHEN t."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id") THEN 'branch belongs to another or missing organization'
      ELSE 'organization_id conflicts with admin organization'
    END
FROM "tables" t
LEFT JOIN "admins" a ON a."id" = t."admin_id"
LEFT JOIN "branches" b ON b."id" = t."branch_id"
WHERE a."id" IS NULL
   OR a."organization_id" IS NULL
   OR (t."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id"))
   OR (t."organization_id" IS NOT NULL AND t."organization_id" <> a."organization_id");

INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'orders', o."id"::text,
    CASE
      WHEN a."id" IS NULL OR a."organization_id" IS NULL THEN 'missing admin organization'
      WHEN o."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id") THEN 'branch belongs to another or missing organization'
      ELSE 'organization_id conflicts with admin organization'
    END
FROM "orders" o
LEFT JOIN "admins" a ON a."id" = o."admin_id"
LEFT JOIN "branches" b ON b."id" = o."branch_id"
WHERE a."id" IS NULL
   OR a."organization_id" IS NULL
   OR (o."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id"))
   OR (o."organization_id" IS NOT NULL AND o."organization_id" <> a."organization_id");

INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'promotions', p."id"::text,
    CASE
      WHEN a."id" IS NULL OR a."organization_id" IS NULL THEN 'missing admin organization'
      WHEN p."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id") THEN 'branch belongs to another or missing organization'
      ELSE 'organization_id conflicts with admin organization'
    END
FROM "promotions" p
LEFT JOIN "admins" a ON a."id" = p."admin_id"
LEFT JOIN "branches" b ON b."id" = p."branch_id"
WHERE a."id" IS NULL
   OR a."organization_id" IS NULL
   OR (p."branch_id" IS NOT NULL AND (b."id" IS NULL OR b."organization_id" <> a."organization_id"))
   OR (p."organization_id" IS NOT NULL AND p."organization_id" <> a."organization_id");

WITH modifier_sources AS (
  SELECT
    mg."id",
    mg."organization_id",
    COUNT(mmg."menu_id") FILTER (WHERE m."id" IS NOT NULL) AS linked_menu_count,
    COUNT(*) FILTER (WHERE mmg."menu_id" IS NOT NULL AND m."id" IS NULL) AS missing_menu_count,
    COUNT(*) FILTER (
      WHERE mmg."menu_id" IS NOT NULL
        AND COALESCE(m."organization_id", menu_admin."organization_id") IS NULL
    ) AS unowned_menu_count,
    COUNT(DISTINCT COALESCE(m."organization_id", menu_admin."organization_id")) AS organization_count,
    MIN(COALESCE(m."organization_id", menu_admin."organization_id")::text)::uuid AS source_organization_id
  FROM "modifier_groups" mg
  LEFT JOIN "menu_modifier_groups" mmg ON mmg."group_id" = mg."id"
  LEFT JOIN "menus" m ON m."id" = mmg."menu_id"
  LEFT JOIN "admins" menu_admin ON menu_admin."id" = m."user_id"
  GROUP BY mg."id", mg."organization_id"
)
INSERT INTO tenant_ownership_backfill_errors (root_name, row_id, reason)
SELECT 'modifier_groups', ms."id"::text,
    CASE
      WHEN ms."organization_id" IS NULL AND ms.linked_menu_count = 0 THEN 'no linked menu ownership source'
      WHEN ms.missing_menu_count > 0 OR ms.unowned_menu_count > 0 THEN 'linked menu is missing or has no organization'
      WHEN ms.organization_count > 1 THEN 'linked menus belong to multiple organizations'
      ELSE 'organization_id conflicts with linked menu organization'
    END
FROM modifier_sources ms
WHERE (
      ms."organization_id" IS NULL
      AND (
        ms.linked_menu_count = 0
        OR ms.missing_menu_count > 0
        OR ms.unowned_menu_count > 0
        OR ms.organization_count <> 1
      )
    )
   OR (
      ms."organization_id" IS NOT NULL
      AND (
        ms.missing_menu_count > 0
        OR ms.unowned_menu_count > 0
        OR ms.organization_count > 1
        OR (ms.linked_menu_count > 0 AND ms."organization_id" <> ms.source_organization_id)
      )
    );

DO $$
DECLARE
  error_count BIGINT;
  error_summary TEXT;
BEGIN
  SELECT COUNT(*) INTO error_count FROM tenant_ownership_backfill_errors;
  IF error_count > 0 THEN
    SELECT string_agg(root_name || '[' || row_id || ']: ' || reason, '; ' ORDER BY root_name, row_id)
      INTO error_summary
    FROM tenant_ownership_backfill_errors;
    RAISE EXCEPTION 'Tenant ownership backfill stopped: % unresolved rows. %', error_count, error_summary
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

UPDATE "categories" c
SET "organization_id" = a."organization_id"
FROM "admins" a
WHERE c."admin_id" = a."id" AND c."organization_id" IS NULL;

UPDATE "ingredients" i
SET "organization_id" = a."organization_id"
FROM "admins" a
WHERE i."admin_id" = a."id" AND i."organization_id" IS NULL;

UPDATE "menus" m
SET "organization_id" = a."organization_id"
FROM "admins" a
WHERE m."user_id" = a."id" AND m."organization_id" IS NULL;

UPDATE "tables" t
SET "organization_id" = a."organization_id"
FROM "admins" a
WHERE t."admin_id" = a."id" AND t."organization_id" IS NULL;

UPDATE "orders" o
SET "organization_id" = a."organization_id"
FROM "admins" a
WHERE o."admin_id" = a."id" AND o."organization_id" IS NULL;

UPDATE "promotions" p
SET "organization_id" = a."organization_id"
FROM "admins" a
WHERE p."admin_id" = a."id" AND p."organization_id" IS NULL;

WITH modifier_sources AS (
  SELECT mmg."group_id", MIN(m."organization_id"::text)::uuid AS organization_id
  FROM "menu_modifier_groups" mmg
  JOIN "menus" m ON m."id" = mmg."menu_id"
  GROUP BY mmg."group_id"
  HAVING COUNT(DISTINCT m."organization_id") = 1
)
UPDATE "modifier_groups" mg
SET "organization_id" = ms.organization_id
FROM modifier_sources ms
WHERE mg."id" = ms."group_id" AND mg."organization_id" IS NULL;
