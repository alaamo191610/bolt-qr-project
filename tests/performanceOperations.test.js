import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  collectPlanEvidence,
  evaluatePlan,
} from '../ops/bin/verify-query-plans.js';
import {
  resolveCapacityConfig,
  runCapacityCheck,
} from '../ops/bin/run-capacity-check.js';

test('query-plan evaluator recognizes expected indexes and rejects base-table scans', () => {
  const indexedDocument = [{
    'Execution Time': 4.2,
    Plan: { 'Node Type': 'Index Scan', 'Relation Name': 'orders', 'Index Name': 'orders_organization_id_created_at_id_idx', 'Actual Rows': 50 },
  }];
  assert.deepEqual(collectPlanEvidence(indexedDocument[0].Plan)[0].index, 'orders_organization_id_created_at_id_idx');
  assert.deepEqual(evaluatePlan({
    name: 'orders',
    document: indexedDocument,
    expectedIndexes: ['orders_organization_id_created_at_id_idx'],
    maxExecutionMs: 250,
    requireIndexScan: true,
  }).failures, []);

  const scan = evaluatePlan({
    name: 'orders',
    document: [{ 'Execution Time': 300, Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'orders' } }],
    expectedIndexes: ['orders_organization_id_created_at_id_idx'],
    maxExecutionMs: 250,
    requireIndexScan: true,
  });
  assert.equal(scan.failures.length, 3);
});

test('capacity config rejects insecure remote HTTP and invalid thresholds', () => {
  assert.throws(() => resolveCapacityConfig({ CAPACITY_BASE_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => resolveCapacityConfig({
    CAPACITY_BASE_URL: 'http://127.0.0.1:3000',
    CAPACITY_MAX_ERROR_RATE: '2',
  }), /CAPACITY_MAX_ERROR_RATE/);
});

test('capacity harness measures p95 and error rate against explicit limits', async t => {
  const server = createServer((request, response) => {
    if (request.url === '/api/fail') {
      response.writeHead(503).end('unavailable');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = new URL(`http://127.0.0.1:${server.address().port}`);

  const report = await runCapacityCheck({
    baseUrl,
    paths: ['/api/ok'],
    authToken: '',
    requests: 100,
    concurrency: 10,
    timeoutMs: 1_000,
    p95LimitMs: 250,
    p99LimitMs: 500,
    maxErrorRate: 0,
    minRequestsPerSecond: 1,
  });
  assert.equal(report.passed, true);
  assert.equal(report.metrics.errors, 0);
  assert.equal(report.metrics.statusCounts[200], 100);
  assert.ok(report.metrics.latencyMs.p95 > 0);

  const failed = await runCapacityCheck({
    ...reportToConfig(report, baseUrl),
    paths: ['/api/fail'],
    requests: 10,
    concurrency: 2,
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.metrics.errorRate, 1);
});

const reportToConfig = (report, baseUrl) => ({
  baseUrl,
  paths: report.paths,
  authToken: '',
  requests: report.metrics.requests,
  concurrency: report.metrics.concurrency,
  timeoutMs: 1_000,
  p95LimitMs: report.limits.p95Ms,
  p99LimitMs: report.limits.p99Ms,
  maxErrorRate: report.limits.maxErrorRate,
  minRequestsPerSecond: report.limits.minRequestsPerSecond,
});
