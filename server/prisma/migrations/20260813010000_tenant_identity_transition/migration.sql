-- Introduce authentication identities and organization memberships without
-- changing the existing restaurant profile IDs used by QR links and APIs.
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_users" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "default_branch_id" UUID,
    "role" "OrganizationRole" NOT NULL DEFAULT 'STAFF',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("organization_id", "user_id")
);

-- Accounts created after the earlier organization migration may not yet have
-- a tenant or branch. Reuse the Admin UUID for deterministic compatibility.
INSERT INTO "organizations" ("id", "name", "slug", "active", "created_at", "updated_at")
SELECT
    a."id",
    COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), NULLIF(SPLIT_PART(a."email", '@', 1), ''), 'Restaurant'),
    'org-' || REPLACE(a."id"::text, '-', ''),
    true,
    a."created_at",
    CURRENT_TIMESTAMP
FROM "admins" a
WHERE a."organization_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "branches" ("id", "organization_id", "code", "name", "timezone", "currency", "active", "created_at", "updated_at")
SELECT
    a."id",
    COALESCE(a."organization_id", a."id"),
    'MAIN',
    COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), 'Main Branch'),
    'Asia/Amman',
    'JOD',
    true,
    a."created_at",
    CURRENT_TIMESTAMP
FROM "admins" a
WHERE a."default_branch_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "admins"
SET
    "organization_id" = COALESCE("organization_id", "id"),
    "default_branch_id" = COALESCE("default_branch_id", "id")
WHERE "organization_id" IS NULL OR "default_branch_id" IS NULL;

-- Complete branch ownership for records created during the compatibility gap.
UPDATE "categories" c SET "branch_id" = a."default_branch_id"
FROM "admins" a WHERE c."admin_id" = a."id" AND c."branch_id" IS NULL;
UPDATE "ingredients" i SET "branch_id" = a."default_branch_id"
FROM "admins" a WHERE i."admin_id" = a."id" AND i."branch_id" IS NULL;
UPDATE "menus" m SET "branch_id" = a."default_branch_id"
FROM "admins" a WHERE m."user_id" = a."id" AND m."branch_id" IS NULL;
UPDATE "tables" t SET "branch_id" = a."default_branch_id"
FROM "admins" a WHERE t."admin_id" = a."id" AND t."branch_id" IS NULL;
UPDATE "orders" o SET "branch_id" = a."default_branch_id"
FROM "admins" a WHERE o."admin_id" = a."id" AND o."branch_id" IS NULL;
UPDATE "promotions" p SET "branch_id" = a."default_branch_id"
FROM "admins" a WHERE p."admin_id" = a."id" AND p."branch_id" IS NULL;

-- Preserve every existing credential and make its Admin UUID the initial User
-- UUID. Existing sessions can therefore be resolved during the rollout.
INSERT INTO "users" ("id", "email", "password_hash", "name", "active", "created_at", "updated_at")
SELECT
    a."id",
    LOWER(BTRIM(a."email")),
    a."password",
    COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), NULLIF(SPLIT_PART(a."email", '@', 1), '')),
    true,
    a."created_at",
    CURRENT_TIMESTAMP
FROM "admins" a
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organization_users" (
    "organization_id", "user_id", "default_branch_id", "role", "status", "created_at", "updated_at"
)
SELECT
    a."organization_id",
    a."id",
    a."default_branch_id",
    'OWNER'::"OrganizationRole",
    'ACTIVE'::"MembershipStatus",
    a."created_at",
    CURRENT_TIMESTAMP
FROM "admins" a
WHERE a."organization_id" IS NOT NULL
ON CONFLICT ("organization_id", "user_id") DO NOTHING;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_active_idx" ON "users"("active");
CREATE INDEX "organization_users_user_id_status_idx" ON "organization_users"("user_id", "status");
CREATE INDEX "organization_users_organization_id_role_status_idx" ON "organization_users"("organization_id", "role", "status");
CREATE INDEX "organization_users_default_branch_id_idx" ON "organization_users"("default_branch_id");

ALTER TABLE "organization_users"
ADD CONSTRAINT "organization_users_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_users"
ADD CONSTRAINT "organization_users_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_users"
ADD CONSTRAINT "organization_users_default_branch_id_fkey"
FOREIGN KEY ("default_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
