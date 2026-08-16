import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { createBareTestDatabase } from '../helpers/testDatabase.js';
import { verifyDatabaseRoles } from '../../ops/bin/verify-database-roles.js';

const projectRoot = resolve(process.cwd());
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
const migrationScript = resolve(projectRoot, 'ops/bin/migrate-deploy.js');
const roleScript = resolve(projectRoot, 'ops/bin/configure-database-roles.sh');

const connectionStringForDatabase = (connectionString, databaseName) => {
  const url = new URL(connectionString);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
};

const connectionStringForRole = (connectionString, databaseName, role, password) => {
  const url = new URL(connectionStringForDatabase(connectionString, databaseName));
  url.username = role;
  url.password = password;
  return url.toString();
};

const quotedCommand = async (client, template, values) => {
  const placeholders = values.map((_, index) => `$${index + 1}::text`).join(', ');
  const result = await client.query(`SELECT format($$${template}$$, ${placeholders}) AS command`, values);
  await client.query(result.rows[0].command);
};

test('runtime database role can perform application DML but cannot own or migrate schema', async t => {
  const sourceUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!sourceUrl) return t.skip('DATABASE_URL or TEST_DATABASE_URL is required');

  const database = await createBareTestDatabase();
  const admin = database.client;
  const sourceRole = (await admin.query(`
    SELECT current_user AS name, r.rolsuper
    FROM pg_roles r WHERE r.rolname = current_user
  `)).rows[0];
  let roleAdmin;
  let roleAdminUsesSourceUrl = sourceRole.rolsuper;
  if (roleAdminUsesSourceUrl) {
    roleAdmin = new Client({ connectionString: connectionStringForDatabase(sourceUrl, 'postgres') });
    await roleAdmin.connect();
  } else {
    try {
      roleAdmin = new Client({ database: 'postgres' });
      await roleAdmin.connect();
      const peerRole = (await roleAdmin.query(`
        SELECT current_user AS name, r.rolsuper
        FROM pg_roles r WHERE r.rolname = current_user
      `)).rows[0];
      if (!peerRole.rolsuper) throw new Error('Peer role is not a superuser');
      roleAdminUsesSourceUrl = false;
    } catch {
      await roleAdmin?.end().catch(() => undefined);
      await database.close();
      return t.skip('Database-role integration test requires a disposable-database role administrator');
    }
  }

  const suffix = `${process.pid}_${randomBytes(4).toString('hex')}`;
  const legacyRole = `boltqr_legacy_${suffix}`.slice(0, 63);
  const migrationRole = `boltqr_migrate_${suffix}`.slice(0, 63);
  const runtimeRole = `boltqr_runtime_${suffix}`.slice(0, 63);
  const legacyPassword = randomBytes(24).toString('base64url');
  const migrationPassword = randomBytes(24).toString('base64url');
  const runtimePassword = randomBytes(24).toString('base64url');
  const runtimeUrl = connectionStringForRole(
    sourceUrl,
    database.databaseName,
    runtimeRole,
    runtimePassword,
  );
  const legacyUrl = connectionStringForRole(
    sourceUrl,
    database.databaseName,
    legacyRole,
    legacyPassword,
  );
  const migrationUrl = connectionStringForRole(
    sourceUrl,
    database.databaseName,
    migrationRole,
    migrationPassword,
  );
  let runtime;
  let migration;
  let legacy;

  try {
    await quotedCommand(roleAdmin, 'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', [
      legacyRole,
      legacyPassword,
    ]);
    await quotedCommand(roleAdmin, 'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', [
      migrationRole,
      migrationPassword,
    ]);
    await quotedCommand(roleAdmin, 'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', [
      runtimeRole,
      runtimePassword,
    ]);
    await quotedCommand(roleAdmin, 'ALTER DATABASE %I OWNER TO %I', [database.databaseName, legacyRole]);

    execFileSync(process.execPath, [
      prismaCli,
      'migrate',
      'deploy',
      '--schema',
      'server/prisma/schema.prisma',
    ], {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: legacyUrl },
      stdio: 'pipe',
    });

    const source = new URL(sourceUrl);
    const roleConnectionEnvironment = roleAdminUsesSourceUrl ? {
      PGHOST: source.hostname,
      PGPORT: source.port || '5432',
      PGUSER: decodeURIComponent(source.username),
      PGPASSWORD: decodeURIComponent(source.password),
    } : {};
    execFileSync('bash', [roleScript], {
      cwd: projectRoot,
      env: {
        ...process.env,
        APP_DATABASE: database.databaseName,
        CURRENT_OWNER_ROLE: legacyRole,
        MIGRATION_DB_ROLE: migrationRole,
        RUNTIME_DB_ROLE: runtimeRole,
        ...roleConnectionEnvironment,
      },
      stdio: 'pipe',
    });

    execFileSync(process.execPath, [migrationScript], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
      },
      stdio: 'pipe',
    });

    runtime = new Client({ connectionString: runtimeUrl });
    migration = new Client({ connectionString: migrationUrl });
    legacy = new Client({ connectionString: legacyUrl });
    await Promise.all([runtime.connect(), migration.connect(), legacy.connect()]);

    assert.equal(Number((await runtime.query('SELECT COUNT(*) FROM public.admins')).rows[0].count), 0);
    const organizationId = randomUUID();
    await runtime.query(
      'INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3)',
      [organizationId, 'Runtime DML Probe', `runtime-probe-${organizationId}`],
    );
    await runtime.query('DELETE FROM public.organizations WHERE id = $1', [organizationId]);

    const adminId = randomUUID();
    await runtime.query(`
      INSERT INTO public.admins (
        id, email, restaurant_name, subscription_plan,
        max_tables, max_menu_items, max_staff_accounts
      ) VALUES ($1, $2, $3, 'PRO', 500, 2000, 10)
    `, [adminId, `finite-pro-${adminId}@example.com`, 'Finite PRO Probe']);
    await assert.rejects(
      runtime.query('UPDATE public.admins SET max_tables = 501 WHERE id = $1', [adminId]),
      error => error.code === '23514',
    );
    await runtime.query('DELETE FROM public.admins WHERE id = $1', [adminId]);

    await assert.rejects(
      runtime.query('CREATE TABLE public.runtime_ddl_forbidden (id integer)'),
      error => error.code === '42501',
    );
    await assert.rejects(
      runtime.query('SELECT migration_name FROM public._prisma_migrations LIMIT 1'),
      error => error.code === '42501',
    );
    await migration.query('CREATE TABLE public.migration_ddl_probe (id integer)');
    await migration.query('DROP TABLE public.migration_ddl_probe');
    assert.equal(Number((await legacy.query('SELECT COUNT(*) FROM public.admins')).rows[0].count), 0);
    await assert.rejects(
      legacy.query(`INSERT INTO public.admins (id, email, restaurant_name) VALUES ($1, $2, $3)`, [
        randomUUID(),
        `legacy-write-${randomUUID()}@example.com`,
        'Legacy Write Forbidden',
      ]),
      error => error.code === '42501',
    );

    const report = await verifyDatabaseRoles({ runtimeUrl, migrationUrl });
    assert.equal(report.passed, true, JSON.stringify(report.failures));
    assert.equal(report.runtimeRole, runtimeRole);
    assert.equal(report.migrationRole, migrationRole);
    assert.equal(report.failures.includes('runtime_role_can_inherit_membership'), false);
    assert.equal(report.failures.includes('migration_role_can_inherit_membership'), false);
    assert.equal(report.tableReport.runtime_owned, 0);
    assert.equal(report.tableReport.runtime_prisma_access, 0);
  } finally {
    await Promise.allSettled([runtime?.end(), migration?.end(), legacy?.end()]);
    await quotedCommand(roleAdmin, 'ALTER DATABASE %I OWNER TO %I', [database.databaseName, sourceRole.name])
      .catch(() => undefined);
    await database.close();
    try {
      await quotedCommand(roleAdmin, 'DROP ROLE IF EXISTS %I', [runtimeRole]);
      await quotedCommand(roleAdmin, 'DROP ROLE IF EXISTS %I', [migrationRole]);
      await quotedCommand(roleAdmin, 'DROP ROLE IF EXISTS %I', [legacyRole]);
    } finally {
      await roleAdmin.end();
    }
  }
});
