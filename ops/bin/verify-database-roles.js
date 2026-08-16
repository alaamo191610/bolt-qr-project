import { Client } from 'pg';

const roleRecord = async client => (await client.query(`
  SELECT current_user AS role_name, r.rolinherit, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
    r.rolreplication, r.rolbypassrls,
    (SELECT COUNT(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS membership_count
  FROM pg_roles r
  WHERE r.rolname = current_user
`)).rows[0];

export const verifyDatabaseRoles = async ({ runtimeUrl, migrationUrl }) => {
  if (!runtimeUrl || !migrationUrl) throw new Error('Runtime and migration database URLs are required');
  if (runtimeUrl === migrationUrl) throw new Error('Runtime and migration database URLs must differ');

  const runtime = new Client({ connectionString: runtimeUrl });
  const migration = new Client({ connectionString: migrationUrl });
  try {
    await Promise.all([runtime.connect(), migration.connect()]);
    const [runtimeRole, migrationRole] = await Promise.all([
      roleRecord(runtime),
      roleRecord(migration),
    ]);
    const databaseName = (await runtime.query('SELECT current_database() AS name')).rows[0].name;
    const roleNamesDiffer = runtimeRole.role_name !== migrationRole.role_name;
    const runtimePowerful = ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']
      .some(field => runtimeRole[field]);
    const migrationPowerful = ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']
      .some(field => migrationRole[field]);

    const runtimePrivileges = (await runtime.query(`
      SELECT
        has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
        has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects,
        has_database_privilege(current_user, current_database(), 'TEMP') AS can_create_temp,
        has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema_objects
    `)).rows[0];
    const tableReport = (await runtime.query(`
      SELECT
        COUNT(*) FILTER (WHERE owner_name = current_user)::int AS runtime_owned,
        COUNT(*) FILTER (WHERE owner_name <> $1)::int AS not_owned_by_migration,
        COUNT(*) FILTER (
          WHERE relname <> '_prisma_migrations'
            AND NOT (can_select AND can_insert AND can_update AND can_delete)
        )::int AS missing_runtime_dml,
        COUNT(*) FILTER (
          WHERE relname = '_prisma_migrations'
            AND (can_select OR can_insert OR can_update OR can_delete)
        )::int AS runtime_prisma_access
      FROM (
        SELECT c.relname, pg_get_userbyid(c.relowner) AS owner_name,
          has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
          has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
          has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
          has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ) tables
    `, [migrationRole.role_name])).rows[0];
    const sequenceReport = (await runtime.query(`
      SELECT
        COUNT(*) FILTER (WHERE pg_get_userbyid(c.relowner) = current_user)::int AS runtime_owned,
        COUNT(*) FILTER (WHERE pg_get_userbyid(c.relowner) <> $1)::int AS not_owned_by_migration,
        COUNT(*) FILTER (WHERE NOT has_sequence_privilege(current_user, c.oid, 'USAGE'))::int
          AS missing_runtime_usage
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S'
    `, [migrationRole.role_name])).rows[0];
    const schemaOwner = (await migration.query(`
      SELECT pg_get_userbyid(nspowner) AS owner_name
      FROM pg_namespace
      WHERE nspname = 'public'
    `)).rows[0]?.owner_name;

    const failures = [];
    if (!roleNamesDiffer) failures.push('runtime_and_migration_roles_match');
    if (runtimePowerful) failures.push('runtime_role_has_cluster_power');
    if (migrationPowerful) failures.push('migration_role_has_cluster_power');
    if (runtimeRole.rolinherit || runtimeRole.membership_count) failures.push('runtime_role_can_inherit_membership');
    if (migrationRole.rolinherit || migrationRole.membership_count) failures.push('migration_role_can_inherit_membership');
    if (!runtimePrivileges.can_connect || !runtimePrivileges.can_use_schema) {
      failures.push('runtime_missing_connection_or_schema_usage');
    }
    if (runtimePrivileges.can_create_database_objects || runtimePrivileges.can_create_temp
      || runtimePrivileges.can_create_schema_objects) failures.push('runtime_role_has_ddl_or_temp');
    if (tableReport.runtime_owned || tableReport.not_owned_by_migration) failures.push('table_ownership_boundary_failed');
    if (tableReport.missing_runtime_dml) failures.push('runtime_missing_table_dml');
    if (tableReport.runtime_prisma_access) failures.push('runtime_can_access_prisma_migrations');
    if (sequenceReport.runtime_owned || sequenceReport.not_owned_by_migration) {
      failures.push('sequence_ownership_boundary_failed');
    }
    if (sequenceReport.missing_runtime_usage) failures.push('runtime_missing_sequence_usage');
    if (schemaOwner !== migrationRole.role_name) failures.push('migration_role_does_not_own_schema');

    return {
      checkedAt: new Date().toISOString(),
      database: databaseName,
      runtimeRole: runtimeRole.role_name,
      migrationRole: migrationRole.role_name,
      tableReport,
      sequenceReport,
      failures,
      passed: failures.length === 0,
    };
  } finally {
    await Promise.allSettled([runtime.end(), migration.end()]);
  }
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  verifyDatabaseRoles({
    runtimeUrl: process.env.DATABASE_URL,
    migrationUrl: process.env.MIGRATION_DATABASE_URL,
  }).then(report => {
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  }).catch(error => {
    console.error(JSON.stringify({ event: 'database_role_verification_failed', message: error.message }));
    process.exitCode = 1;
  });
}
