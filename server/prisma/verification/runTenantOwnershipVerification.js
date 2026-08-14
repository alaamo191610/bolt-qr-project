import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const verificationSqlPath = fileURLToPath(new URL('./tenant_ownership.sql', import.meta.url));

const countFields = [
  'total_rows',
  'missing_organization',
  'invalid_organization',
  'owner_mismatches',
  'branch_mismatches',
  'link_mismatches',
  'issue_count',
];

export const normalizeTenantOwnershipReport = rows => rows.map(row => ({
  ...row,
  ...Object.fromEntries(countFields.map(field => [field, Number(row[field])])),
  enforcement_ready: row.enforcement_ready === true,
}));

export const assertTenantOwnershipReady = report => {
  const failures = report.filter(row => !row.enforcement_ready || row.issue_count !== 0);
  if (failures.length) {
    const summary = failures
      .map(row => `${row.root_name}:${row.issue_count}`)
      .join(', ');
    throw new Error(`Tenant ownership verification failed (${summary})`);
  }
  return report;
};

export const runTenantOwnershipVerification = async ({
  databaseUrl = process.env.DATABASE_URL,
  output = console.log,
} = {}) => {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for tenant ownership verification');

  const sql = await readFile(verificationSqlPath, 'utf8');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(sql);
    await client.query('ROLLBACK');
    const report = assertTenantOwnershipReady(normalizeTenantOwnershipReport(result.rows));
    output(JSON.stringify({ status: 'ready', roots: report }, null, 2));
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
};

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  runTenantOwnershipVerification().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
