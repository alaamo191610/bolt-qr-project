import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBareTestDatabase } from '../helpers/testDatabase.js';

const MIGRATIONS_ROOT = resolve(process.cwd(), 'server/prisma/migrations');
const TRANSITION_MIGRATION = '20260813010000_tenant_identity_transition';
const EXPAND_MIGRATION = '20260814090000_expand_tenant_ownership';
const BACKFILL_MIGRATION = '20260814100000_backfill_tenant_ownership';
const ENFORCEMENT_MIGRATION = '20260815140000_enforce_tenant_ownership';
const VERIFICATION_SQL = resolve(
  process.cwd(),
  'server/prisma/verification/tenant_ownership.sql',
);

let database;
let client;
let legacyAdmins;

const seedLegacyAdmin = async (label) => {
  const adminId = randomUUID();
  const email = `legacy-${label.toLowerCase()}-${adminId.slice(0, 8)}@example.com`;
  const categoryName = `${label} Legacy Category`;

  await client.query(
    'INSERT INTO "admins" ("id", "email", "password", "restaurant_name") VALUES ($1, $2, $3, $4)',
    [adminId, email, `legacy-hash-${label}`, `Legacy ${label}`],
  );
  const category = await client.query(
    'INSERT INTO "categories" ("admin_id", "name_en") VALUES ($1, $2) RETURNING "id"',
    [adminId, categoryName],
  );
  const menu = await client.query(
    'INSERT INTO "menus" ("user_id", "category_id", "name_en", "price") VALUES ($1, $2, $3, $4) RETURNING "id"',
    [adminId, category.rows[0].id, `${label} Legacy Menu`, 12.5],
  );
  const ingredient = await client.query(
    'INSERT INTO "ingredients" ("admin_id", "name_en") VALUES ($1, $2) RETURNING "id"',
    [adminId, `${label} Legacy Ingredient`],
  );
  await client.query(
    'INSERT INTO "menu_ingredients" ("menu_id", "ingredient_id") VALUES ($1, $2)',
    [menu.rows[0].id, ingredient.rows[0].id],
  );
  const modifierGroup = await client.query(
    'INSERT INTO "modifier_groups" ("name_en") VALUES ($1) RETURNING "id"',
    [`${label} Legacy Modifier Group`],
  );
  await client.query(
    'INSERT INTO "menu_modifier_groups" ("menu_id", "group_id") VALUES ($1, $2)',
    [menu.rows[0].id, modifierGroup.rows[0].id],
  );
  const table = await client.query(
    'INSERT INTO "tables" ("admin_id", "code") VALUES ($1, $2) RETURNING "id"',
    [adminId, `${label}-01`],
  );
  const order = await client.query(
    'INSERT INTO "orders" ("admin_id", "table_id", "subtotal", "total") VALUES ($1, $2, $3, $4) RETURNING "id"',
    [adminId, table.rows[0].id, 12.5, 12.5],
  );
  const promotion = await client.query(
    'INSERT INTO "promotions" ("id", "admin_id", "code", "value") VALUES ($1, $2, $3, $4) RETURNING "id"',
    [randomUUID(), adminId, `${label.toUpperCase()}10`, 10],
  );

  return {
    adminId,
    categoryId: category.rows[0].id,
    menuId: menu.rows[0].id,
    ingredientId: ingredient.rows[0].id,
    modifierGroupId: modifierGroup.rows[0].id,
    tableId: table.rows[0].id,
    orderId: order.rows[0].id,
    promotionId: promotion.rows[0].id,
  };
};

const applyPreTransitionMigrations = async () => {
  const entries = await readdir(MIGRATIONS_ROOT, { withFileTypes: true });
  const migrations = entries
    .filter(entry => entry.isDirectory() && entry.name < TRANSITION_MIGRATION)
    .map(entry => entry.name)
    .sort();

  for (const migration of migrations) {
    const sql = await readFile(resolve(MIGRATIONS_ROOT, migration, 'migration.sql'), 'utf8');
    await client.query(sql);
  }
};

const applyTenantTransition = async () => {
  const sql = await readFile(
    resolve(MIGRATIONS_ROOT, TRANSITION_MIGRATION, 'migration.sql'),
    'utf8',
  );
  await client.query(sql);
};

const applyExpandMigration = async () => {
  const sql = await readFile(
    resolve(MIGRATIONS_ROOT, EXPAND_MIGRATION, 'migration.sql'),
    'utf8',
  );
  await client.query(sql);
};

const applyBackfillMigration = async () => {
  const sql = await readFile(
    resolve(MIGRATIONS_ROOT, BACKFILL_MIGRATION, 'migration.sql'),
    'utf8',
  );
  await client.query(sql);
};

const applyPostBackfillMigrations = async () => {
  const entries = await readdir(MIGRATIONS_ROOT, { withFileTypes: true });
  const migrations = entries
    .filter(entry => entry.isDirectory()
      && entry.name > BACKFILL_MIGRATION
      && entry.name < ENFORCEMENT_MIGRATION)
    .map(entry => entry.name)
    .sort();

  for (const migration of migrations) {
    const sql = await readFile(resolve(MIGRATIONS_ROOT, migration, 'migration.sql'), 'utf8');
    await client.query(sql);
  }
};

const applyEnforcementMigration = async () => {
  const sql = await readFile(
    resolve(MIGRATIONS_ROOT, ENFORCEMENT_MIGRATION, 'migration.sql'),
    'utf8',
  );
  await client.query(sql);
};

const runOwnershipVerification = async () => {
  const sql = await readFile(VERIFICATION_SQL, 'utf8');
  return client.query(sql);
};

const replayBackfillStatements = async () => {
  await client.query(`
    INSERT INTO "organizations" ("id", "name", "slug", "active", "created_at", "updated_at")
    SELECT a."id", COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), 'Restaurant'),
      'org-' || REPLACE(a."id"::text, '-', ''), true, a."created_at", CURRENT_TIMESTAMP
    FROM "admins" a
    WHERE a."organization_id" IS NULL
    ON CONFLICT ("id") DO NOTHING
  `);
  await client.query(`
    INSERT INTO "branches" ("id", "organization_id", "code", "name", "timezone", "currency", "active", "created_at", "updated_at")
    SELECT a."id", COALESCE(a."organization_id", a."id"), 'MAIN',
      COALESCE(NULLIF(BTRIM(a."restaurant_name"), ''), 'Main Branch'), 'Asia/Amman', 'JOD', true,
      a."created_at", CURRENT_TIMESTAMP
    FROM "admins" a
    WHERE a."default_branch_id" IS NULL
    ON CONFLICT ("id") DO NOTHING
  `);
  await client.query(`
    INSERT INTO "users" ("id", "email", "password_hash", "name", "active", "created_at", "updated_at")
    SELECT a."id", LOWER(BTRIM(a."email")), a."password", a."restaurant_name", true,
      a."created_at", CURRENT_TIMESTAMP
    FROM "admins" a
    ON CONFLICT ("id") DO NOTHING
  `);
  await client.query(`
    INSERT INTO "organization_users" ("organization_id", "user_id", "default_branch_id", "role", "status", "created_at", "updated_at")
    SELECT a."organization_id", a."id", a."default_branch_id", 'OWNER'::"OrganizationRole",
      'ACTIVE'::"MembershipStatus", a."created_at", CURRENT_TIMESTAMP
    FROM "admins" a
    WHERE a."organization_id" IS NOT NULL
    ON CONFLICT ("organization_id", "user_id") DO NOTHING
  `);
};

before(async () => {
  database = await createBareTestDatabase();
  client = database.client;
  await applyPreTransitionMigrations();
  legacyAdmins = [await seedLegacyAdmin('Alpha'), await seedLegacyAdmin('Beta')];
  await applyTenantTransition();
  await applyExpandMigration();
  await applyBackfillMigration();
  await applyPostBackfillMigrations();
});

after(async () => {
  await database.close();
});

test('tenant transition backfills every legacy aggregate and direct organization owner', async () => {
  const adminIds = legacyAdmins.map(admin => admin.adminId);
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "organizations" WHERE "id" = ANY($1::uuid[])) AS organizations,
      (SELECT COUNT(*) FROM "branches" WHERE "id" = ANY($1::uuid[])) AS branches,
      (SELECT COUNT(*) FROM "users" WHERE "id" = ANY($1::uuid[])) AS users,
      (SELECT COUNT(*) FROM "organization_users" WHERE "user_id" = ANY($1::uuid[])) AS memberships,
      (SELECT COUNT(*) FROM "admins" WHERE "id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL AND "default_branch_id" IS NOT NULL) AS owned_admins,
      (SELECT COUNT(*) FROM "categories" WHERE "admin_id" = ANY($1::uuid[]) AND "branch_id" IS NOT NULL) AS categories,
      (SELECT COUNT(*) FROM "ingredients" WHERE "admin_id" = ANY($1::uuid[]) AND "branch_id" IS NOT NULL) AS ingredients,
      (SELECT COUNT(*) FROM "menus" WHERE "user_id" = ANY($1::uuid[]) AND "branch_id" IS NOT NULL) AS menus,
      (SELECT COUNT(*) FROM "tables" WHERE "admin_id" = ANY($1::uuid[]) AND "branch_id" IS NOT NULL) AS tables,
      (SELECT COUNT(*) FROM "orders" WHERE "admin_id" = ANY($1::uuid[]) AND "branch_id" IS NOT NULL) AS orders,
      (SELECT COUNT(*) FROM "promotions" WHERE "admin_id" = ANY($1::uuid[]) AND "branch_id" IS NOT NULL) AS promotions
  `, [adminIds]);

  assert.deepEqual(Object.values(counts.rows[0]).map(Number), [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);

  const expanded = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'organization_id'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [['categories', 'ingredients', 'menus', 'tables', 'orders', 'promotions', 'modifier_groups']]);
  assert.equal(expanded.rowCount, 7);

  const ownershipIndexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY($1::text[])
  `, [[
    'categories_organization_id_idx',
    'ingredients_organization_id_idx',
    'menus_organization_id_idx',
    'tables_organization_id_idx',
    'orders_organization_id_idx',
    'promotions_organization_id_idx',
    'modifier_groups_organization_id_idx',
  ]]);
  assert.equal(ownershipIndexes.rowCount, 7);

  const ownershipRows = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "categories" WHERE "admin_id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL) +
      (SELECT COUNT(*) FROM "ingredients" WHERE "admin_id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL) +
      (SELECT COUNT(*) FROM "menus" WHERE "user_id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL) +
      (SELECT COUNT(*) FROM "tables" WHERE "admin_id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL) +
      (SELECT COUNT(*) FROM "orders" WHERE "admin_id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL) +
      (SELECT COUNT(*) FROM "promotions" WHERE "admin_id" = ANY($1::uuid[]) AND "organization_id" IS NOT NULL) +
      (SELECT COUNT(*) FROM "modifier_groups" WHERE "organization_id" = ANY($1::uuid[]))
      AS owned_legacy_roots
  `, [adminIds]);
  assert.equal(Number(ownershipRows.rows[0].owned_legacy_roots), 14);

  const ownershipMismatches = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "categories" c JOIN "admins" a ON a."id" = c."admin_id" WHERE c."organization_id" <> a."organization_id") +
      (SELECT COUNT(*) FROM "ingredients" i JOIN "admins" a ON a."id" = i."admin_id" WHERE i."organization_id" <> a."organization_id") +
      (SELECT COUNT(*) FROM "menus" m JOIN "admins" a ON a."id" = m."user_id" WHERE m."organization_id" <> a."organization_id") +
      (SELECT COUNT(*) FROM "tables" t JOIN "admins" a ON a."id" = t."admin_id" WHERE t."organization_id" <> a."organization_id") +
      (SELECT COUNT(*) FROM "orders" o JOIN "admins" a ON a."id" = o."admin_id" WHERE o."organization_id" <> a."organization_id") +
      (SELECT COUNT(*) FROM "promotions" p JOIN "admins" a ON a."id" = p."admin_id" WHERE p."organization_id" <> a."organization_id") +
      (SELECT COUNT(*) FROM "menu_modifier_groups" mmg JOIN "menus" m ON m."id" = mmg."menu_id" JOIN "modifier_groups" mg ON mg."id" = mmg."group_id" WHERE m."organization_id" <> mg."organization_id")
      AS ownership_mismatches
  `);
  assert.equal(Number(ownershipMismatches.rows[0].ownership_mismatches), 0);

  await assert.rejects(
    client.query(
      'UPDATE "menus" SET "organization_id" = $1 WHERE "id" = $2',
      [randomUUID(), legacyAdmins[0].menuId],
    ),
    error => error?.code === '23503',
  );
});

test('ownership verification reports all seven roots ready for enforcement review', async () => {
  const report = await runOwnershipVerification();

  assert.equal(report.rowCount, 7);
  assert.deepEqual(report.rows.map(row => row.root_name), [
    'categories',
    'ingredients',
    'menus',
    'modifier_groups',
    'orders',
    'promotions',
    'tables',
  ]);
  assert.deepEqual(report.rows.map(row => Number(row.total_rows)), [2, 2, 2, 2, 2, 2, 2]);
  assert.ok(report.rows.every(row => Number(row.issue_count) === 0));
  assert.ok(report.rows.every(row => row.enforcement_ready === true));
});

test('tenant transition preserves ownership boundaries and rerunnable backfill semantics', async () => {
  const [alpha, beta] = legacyAdmins;
  const scopedAlpha = await client.query(
    'SELECT "id" FROM "menus" WHERE "user_id" = $1 AND "user_id" <> $2',
    [alpha.adminId, beta.adminId],
  );
  const scopedBeta = await client.query(
    'SELECT "id" FROM "menus" WHERE "user_id" = $1 AND "user_id" <> $2',
    [beta.adminId, alpha.adminId],
  );
  assert.equal(scopedAlpha.rowCount, 1);
  assert.equal(scopedBeta.rowCount, 1);

  await applyBackfillMigration();
  await replayBackfillStatements();

  const replayCounts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "organizations" WHERE "id" = ANY($1::uuid[])) AS organizations,
      (SELECT COUNT(*) FROM "branches" WHERE "id" = ANY($1::uuid[])) AS branches,
      (SELECT COUNT(*) FROM "users" WHERE "id" = ANY($1::uuid[])) AS users,
      (SELECT COUNT(*) FROM "organization_users" WHERE "user_id" = ANY($1::uuid[])) AS memberships
  `, [[alpha.adminId, beta.adminId]]);
  assert.deepEqual(Object.values(replayCounts.rows[0]).map(Number), [2, 2, 2, 2]);
});

test('ownership verification detects corruption in every tenant aggregate root', async () => {
  const [alpha, beta] = legacyAdmins;
  await client.query('BEGIN');
  try {
    await client.query('UPDATE "categories" SET "organization_id" = $1 WHERE "id" = $2', [beta.adminId, alpha.categoryId]);
    await client.query('UPDATE "ingredients" SET "organization_id" = $1 WHERE "id" = $2', [beta.adminId, alpha.ingredientId]);
    await client.query('UPDATE "menus" SET "organization_id" = $1 WHERE "id" = $2', [beta.adminId, alpha.menuId]);
    await client.query('UPDATE "tables" SET "organization_id" = $1 WHERE "id" = $2', [beta.adminId, alpha.tableId]);
    await client.query('UPDATE "orders" SET "organization_id" = $1 WHERE "id" = $2', [beta.adminId, alpha.orderId]);
    await client.query('UPDATE "promotions" SET "organization_id" = $1 WHERE "id" = $2', [beta.adminId, alpha.promotionId]);
    const report = await runOwnershipVerification();
    assert.equal(report.rowCount, 7);
    assert.ok(report.rows.every(row => Number(row.issue_count) > 0));
    assert.ok(report.rows.every(row => row.enforcement_ready === false));
  } finally {
    await client.query('ROLLBACK');
  }
});

test('organization backfill fails closed for a modifier group linked across tenants', async () => {
  const group = await client.query(
    'INSERT INTO "modifier_groups" ("name_en") VALUES ($1) RETURNING "id"',
    ['Ambiguous Group'],
  );
  await client.query(
    'INSERT INTO "menu_modifier_groups" ("menu_id", "group_id") VALUES ($1, $2), ($3, $2)',
    [legacyAdmins[0].menuId, group.rows[0].id, legacyAdmins[1].menuId],
  );

  await assert.rejects(
    applyBackfillMigration(),
    error => error?.code === '23514'
      && error.message.includes('modifier_groups')
      && error.message.includes('multiple organizations'),
  );

  await client.query('DELETE FROM "menu_modifier_groups" WHERE "group_id" = $1', [group.rows[0].id]);
  await client.query('DELETE FROM "modifier_groups" WHERE "id" = $1', [group.rows[0].id]);
});

test('final tenant enforcement blocks corruption and applies cleanly after rollback', async () => {
  const [alpha, beta] = legacyAdmins;

  await client.query('BEGIN');
  try {
    await client.query(
      'UPDATE "categories" SET "organization_id" = $1 WHERE "id" = $2',
      [beta.adminId, alpha.categoryId],
    );

    await assert.rejects(
      applyEnforcementMigration(),
      error => error?.code === '23514'
        && error.message.includes('Tenant ownership enforcement blocked'),
    );
  } finally {
    await client.query('ROLLBACK');
  }

  const cleanReport = await runOwnershipVerification();
  assert.ok(cleanReport.rows.every(row => Number(row.issue_count) === 0));

  await applyEnforcementMigration();

  const requiredColumns = await client.query(`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'organization_id'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [['categories', 'ingredients', 'menus', 'modifier_groups', 'orders', 'promotions', 'tables']]);
  assert.equal(requiredColumns.rowCount, 7);
  assert.ok(requiredColumns.rows.every(row => row.is_nullable === 'NO'));

  await assert.rejects(
    client.query(
      'UPDATE "categories" SET "organization_id" = $1 WHERE "id" = $2',
      [beta.adminId, alpha.categoryId],
    ),
    error => error?.code === '23503',
  );

  const enforcedConstraints = await client.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'categories_admin_organization_fkey',
      'categories_branch_organization_fkey',
      'menus_category_organization_fkey',
      'orders_table_organization_fkey',
      'promotions_table_organization_fkey'
    )
  `);
  assert.equal(enforcedConstraints.rowCount, 5);
});
