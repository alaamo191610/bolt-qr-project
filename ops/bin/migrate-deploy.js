import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!runtimeUrl || !migrationUrl) {
  console.error('DATABASE_URL and MIGRATION_DATABASE_URL are required');
  process.exit(78);
}
if (runtimeUrl === migrationUrl) {
  console.error('Runtime and migration database URLs must use distinct roles');
  process.exit(78);
}

const childEnvironment = { ...process.env, DATABASE_URL: migrationUrl };
for (const key of [
  'MIGRATION_DATABASE_URL',
  'JWT_SECRET',
  'SUPER_ADMIN_MFA_ENCRYPTION_KEY',
  'SENTRY_DSN',
]) delete childEnvironment[key];

const prismaCli = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [
  prismaCli,
  'migrate',
  'deploy',
  '--schema',
  'server/prisma/schema.prisma',
], {
  cwd: process.cwd(),
  env: childEnvironment,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Unable to start Prisma migration');
  process.exit(1);
}
process.exit(result.status ?? 1);
