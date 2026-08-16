DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "admins"
    WHERE "subscription_plan" NOT IN ('STANDARD', 'BASIC', 'PRO')
  ) THEN
    RAISE EXCEPTION 'Unknown subscription plan found; refusing entitlement enforcement';
  END IF;
END $$;

UPDATE "admins"
SET
  "max_tables" = CASE "subscription_plan"
    WHEN 'STANDARD' THEN 10
    WHEN 'BASIC' THEN 25
    WHEN 'PRO' THEN 500
  END,
  "max_menu_items" = CASE "subscription_plan"
    WHEN 'STANDARD' THEN 50
    WHEN 'BASIC' THEN 150
    WHEN 'PRO' THEN 2000
  END,
  "max_staff_accounts" = CASE "subscription_plan"
    WHEN 'STANDARD' THEN 1
    WHEN 'BASIC' THEN 3
    WHEN 'PRO' THEN 10
  END;

ALTER TABLE "admins"
ADD CONSTRAINT "admins_plan_entitlements_finite_check"
CHECK (
  ("subscription_plan" = 'STANDARD'
    AND "max_tables" = 10
    AND "max_menu_items" = 50
    AND "max_staff_accounts" = 1)
  OR
  ("subscription_plan" = 'BASIC'
    AND "max_tables" = 25
    AND "max_menu_items" = 150
    AND "max_staff_accounts" = 3)
  OR
  ("subscription_plan" = 'PRO'
    AND "max_tables" = 500
    AND "max_menu_items" = 2000
    AND "max_staff_accounts" = 10)
) NOT VALID;

ALTER TABLE "admins"
VALIDATE CONSTRAINT "admins_plan_entitlements_finite_check";
