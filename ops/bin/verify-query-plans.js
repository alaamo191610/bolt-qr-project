#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requiredIndexes = [
  'orders_organization_id_created_at_id_idx',
  'orders_organization_id_status_created_at_id_idx',
  'admins_created_at_id_idx',
  'admins_subscription_status_subscription_plan_idx',
  'admins_subscription_plan_created_at_id_idx',
  'promotions_organization_id_created_at_id_idx',
];

const parsePositiveNumber = (value, fallback, label) => {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number`);
  return parsed;
};

export const collectPlanEvidence = root => {
  const nodes = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value['Node Type']) {
      nodes.push({
        nodeType: value['Node Type'],
        relation: value['Relation Name'] || null,
        index: value['Index Name'] || null,
        actualRows: Number(value['Actual Rows']) || 0,
      });
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(root);
  return nodes;
};

export const evaluatePlan = ({ name, document, expectedIndexes, maxExecutionMs, requireIndexScan }) => {
  const planRoot = document?.[0]?.Plan;
  if (!planRoot) throw new Error(`${name} did not return a PostgreSQL JSON plan`);
  const executionMs = Number(document[0]['Execution Time']);
  const nodes = collectPlanEvidence(planRoot);
  const indexes = [...new Set(nodes.map(node => node.index).filter(Boolean))];
  const baseSequentialScans = nodes.filter(node => (
    node.nodeType === 'Seq Scan' && ['orders', 'admins', 'promotions'].includes(node.relation)
  ));
  const usesExpectedIndex = expectedIndexes.some(index => indexes.includes(index));
  const failures = [];
  if (!Number.isFinite(executionMs) || executionMs > maxExecutionMs) {
    failures.push(`execution ${executionMs}ms exceeds ${maxExecutionMs}ms`);
  }
  if (requireIndexScan && !usesExpectedIndex) failures.push('expected index was not used');
  if (requireIndexScan && baseSequentialScans.length) {
    failures.push(`base-table sequential scan: ${baseSequentialScans.map(node => node.relation).join(', ')}`);
  }
  return { name, executionMs, indexes, usesExpectedIndex, baseSequentialScans, failures };
};

const queryDefinitions = organizationId => [
  {
    name: 'orders-first-page',
    expectedIndexes: ['orders_organization_id_created_at_id_idx'],
    text: `SELECT id, created_at FROM orders
      WHERE organization_id = $1::uuid
      ORDER BY created_at DESC, id DESC LIMIT 51`,
    values: [organizationId],
  },
  {
    name: 'orders-active-page',
    expectedIndexes: [
      'orders_organization_id_status_created_at_id_idx',
      'orders_organization_id_created_at_id_idx',
    ],
    text: `SELECT id, created_at FROM orders
      WHERE organization_id = $1::uuid AND status IN ('pending', 'preparing', 'ready')
      ORDER BY created_at DESC, id DESC LIMIT 51`,
    values: [organizationId],
  },
  {
    name: 'analytics-window',
    expectedIndexes: [
      'orders_organization_id_created_at_id_idx',
      'orders_organization_id_idx',
      'orders_organization_id_table_id_table_session_id_status_idx',
    ],
    text: `SELECT status, COUNT(*), COALESCE(SUM(total), 0)
      FROM orders
      WHERE organization_id = $1::uuid
        AND created_at >= CURRENT_TIMESTAMP - ($2::integer * interval '1 day')
      GROUP BY status`,
    values: [organizationId, 30],
  },
  {
    name: 'promotions-first-page',
    expectedIndexes: [
      'promotions_organization_id_created_at_id_idx',
      'promotions_organization_id_idx',
    ],
    text: `SELECT id, created_at FROM promotions
      WHERE organization_id = $1::uuid
      ORDER BY created_at DESC, id DESC LIMIT 51`,
    values: [organizationId],
  },
  {
    name: 'restaurants-first-page',
    expectedIndexes: ['admins_created_at_id_idx'],
    text: 'SELECT id, created_at FROM admins ORDER BY created_at DESC, id DESC LIMIT 26',
    values: [],
  },
  {
    name: 'restaurants-plan-page',
    expectedIndexes: [
      'admins_subscription_plan_created_at_id_idx',
      'admins_created_at_id_idx',
    ],
    text: `SELECT id, created_at FROM admins
      WHERE subscription_plan = 'PRO'
      ORDER BY created_at DESC, id DESC LIMIT 26`,
    values: [],
  },
  {
    name: 'platform-active-plan-aggregate',
    expectedIndexes: ['admins_subscription_status_subscription_plan_idx'],
    text: `SELECT subscription_plan, COUNT(*)
      FROM admins
      WHERE subscription_status = 'ACTIVE'
      GROUP BY subscription_plan`,
    values: [],
  },
];

export const verifyQueryPlans = async ({
  databaseUrl,
  organizationId,
  maxExecutionMs = 250,
  requireIndexScan = true,
}) => {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!UUID.test(String(organizationId || ''))) throw new Error('QUERY_PLAN_ORGANIZATION_ID must be a UUID');
  const client = new Client({ connectionString: databaseUrl, application_name: 'bolt-query-plan-verifier' });
  await client.connect();
  try {
    await client.query('SET statement_timeout = 10000');
    const indexRows = await client.query(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, [requiredIndexes]);
    const presentIndexes = new Set(indexRows.rows.map(row => row.indexname));
    const missingIndexes = requiredIndexes.filter(index => !presentIndexes.has(index));
    if (missingIndexes.length) throw new Error(`Required indexes are missing: ${missingIndexes.join(', ')}`);

    const results = [];
    for (const query of queryDefinitions(organizationId)) {
      const explained = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`, query.values);
      results.push(evaluatePlan({
        name: query.name,
        document: explained.rows[0]['QUERY PLAN'],
        expectedIndexes: query.expectedIndexes,
        maxExecutionMs,
        requireIndexScan,
      }));
    }
    return {
      checkedAt: new Date().toISOString(),
      organizationId,
      requireIndexScan,
      maxExecutionMs,
      indexes: requiredIndexes,
      results,
      passed: results.every(result => result.failures.length === 0),
    };
  } finally {
    await client.end();
  }
};

const main = async () => {
  try {
    const report = await verifyQueryPlans({
      databaseUrl: process.env.DATABASE_URL,
      organizationId: process.env.QUERY_PLAN_ORGANIZATION_ID,
      maxExecutionMs: parsePositiveNumber(process.env.QUERY_PLAN_MAX_EXECUTION_MS, 250, 'QUERY_PLAN_MAX_EXECUTION_MS'),
      requireIndexScan: process.env.QUERY_PLAN_REQUIRE_INDEX_SCAN !== 'false',
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`Query-plan verification failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
