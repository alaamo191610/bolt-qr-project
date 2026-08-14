import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';

const PROJECT_ROOT = resolve(process.cwd());
const PRISMA_SCHEMA = resolve(PROJECT_ROOT, 'server/prisma/schema.prisma');
const PRISMA_CLI = resolve(PROJECT_ROOT, 'node_modules/prisma/build/index.js');
const TEST_DATABASE_PATTERN = /^bolt_qr_test_[a-z0-9_]+$/;

const databaseNameFromUrl = connectionString => {
  const url = new URL(connectionString);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
};

const connectionStringForDatabase = (connectionString, databaseName) => {
  const url = new URL(connectionString);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
};

const maintenanceConnectionString = connectionString => connectionStringForDatabase(
  connectionString,
  'postgres',
);

const quoteIdentifier = identifier => `"${String(identifier).replaceAll('"', '""')}"`;

const databaseExists = async (client, databaseName) => {
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  return result.rowCount === 1;
};

const runMigrations = databaseUrl => {
  try {
    execFileSync(process.execPath, [
      PRISMA_CLI,
      'migrate',
      'deploy',
      '--schema',
      PRISMA_SCHEMA,
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map(value => value.toString())
      .join('\n');
    throw new Error(`Test database migrations failed${output ? `:\n${output}` : ''}`, {
      cause: error,
    });
  }
};

const truncateApplicationTables = async prisma => {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  if (!tables.length) return;

  const tableList = tables.map(({ tablename }) => quoteIdentifier(tablename)).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
};

export const createTestDatabase = async () => {
  const sourceUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('DATABASE_URL or TEST_DATABASE_URL is required for integration tests');

  const configuredDatabase = Boolean(process.env.TEST_DATABASE_URL);
  const databaseName = configuredDatabase
    ? databaseNameFromUrl(sourceUrl)
    : `bolt_qr_test_${process.pid}_${Date.now()}_${randomUUID().slice(0, 8)}`;

  if (!TEST_DATABASE_PATTERN.test(databaseName)) {
    throw new Error(`Refusing unsafe test database name: ${databaseName}`);
  }

  const databaseUrl = connectionStringForDatabase(sourceUrl, databaseName);
  const maintenanceClient = new Client({ connectionString: maintenanceConnectionString(sourceUrl) });
  await maintenanceClient.connect();
  let ownedDatabase = false;
  try {
    if (!(await databaseExists(maintenanceClient, databaseName))) {
      await maintenanceClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      ownedDatabase = true;
    }
  } finally {
    await maintenanceClient.end();
  }

  try {
    runMigrations(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    await truncateApplicationTables(prisma);

    return {
      databaseName,
      databaseUrl,
      prisma,
      async reset() {
        await truncateApplicationTables(prisma);
      },
      async close() {
        await prisma.$disconnect();
        if (!ownedDatabase) return;
        const dropClient = new Client({ connectionString: maintenanceConnectionString(sourceUrl) });
        await dropClient.connect();
        try {
          await dropClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
        } finally {
          await dropClient.end();
        }
      },
    };
  } catch (error) {
    if (ownedDatabase) {
      const cleanupClient = new Client({ connectionString: maintenanceConnectionString(sourceUrl) });
      await cleanupClient.connect();
      try {
        await cleanupClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      } finally {
        await cleanupClient.end();
      }
    }
    throw error;
  }
};
