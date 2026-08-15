#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const intSetting = (value, fallback, { name, min = 1, max = 100_000 }) => {
  const candidate = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return candidate;
};

const numberSetting = (value, fallback, { name, min = 0, max = Number.MAX_VALUE }) => {
  const candidate = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(candidate) || candidate < min || candidate > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return candidate;
};

const percentile = (sortedValues, fraction) => {
  if (!sortedValues.length) return 0;
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)];
};

export const resolveCapacityConfig = (environment = process.env) => {
  if (!environment.CAPACITY_BASE_URL) throw new Error('CAPACITY_BASE_URL is required');
  const baseUrl = new URL(environment.CAPACITY_BASE_URL);
  if (baseUrl.username || baseUrl.password) throw new Error('CAPACITY_BASE_URL must not contain credentials');
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname);
  if (baseUrl.protocol !== 'https:' && !(localHost || environment.CAPACITY_ALLOW_HTTP === 'true')) {
    throw new Error('CAPACITY_BASE_URL must use HTTPS unless explicitly allowed for a test environment');
  }
  const paths = String(environment.CAPACITY_PATHS || '/api/health/ready,/api/orders?scope=active&limit=50,/api/admin/analytics?days=30')
    .split(',').map(path => path.trim()).filter(Boolean);
  if (!paths.length || paths.some(path => !path.startsWith('/api/'))) {
    throw new Error('CAPACITY_PATHS must contain comma-separated /api/ paths');
  }
  return {
    baseUrl,
    paths,
    authToken: environment.CAPACITY_AUTH_TOKEN || '',
    requests: intSetting(environment.CAPACITY_REQUESTS, 300, { name: 'CAPACITY_REQUESTS' }),
    concurrency: intSetting(environment.CAPACITY_CONCURRENCY, 10, { name: 'CAPACITY_CONCURRENCY', max: 500 }),
    timeoutMs: intSetting(environment.CAPACITY_TIMEOUT_MS, 5_000, { name: 'CAPACITY_TIMEOUT_MS', max: 60_000 }),
    p95LimitMs: numberSetting(environment.CAPACITY_P95_LIMIT_MS, 250, { name: 'CAPACITY_P95_LIMIT_MS', min: 1 }),
    p99LimitMs: numberSetting(environment.CAPACITY_P99_LIMIT_MS, 750, { name: 'CAPACITY_P99_LIMIT_MS', min: 1 }),
    maxErrorRate: numberSetting(environment.CAPACITY_MAX_ERROR_RATE, 0.01, { name: 'CAPACITY_MAX_ERROR_RATE', max: 1 }),
    minRequestsPerSecond: numberSetting(environment.CAPACITY_MIN_RPS, 5, { name: 'CAPACITY_MIN_RPS' }),
  };
};

export const runCapacityCheck = async config => {
  const durations = [];
  const statusCounts = {};
  const errors = [];
  let nextRequest = 0;
  const startedAt = performance.now();

  const worker = async () => {
    while (true) {
      const requestNumber = nextRequest++;
      if (requestNumber >= config.requests) return;
      const path = config.paths[requestNumber % config.paths.length];
      const requestStarted = performance.now();
      try {
        const response = await fetch(new URL(path, config.baseUrl), {
          headers: config.authToken && !path.startsWith('/api/health/')
            ? { Authorization: `Bearer ${config.authToken}` }
            : {},
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        await response.arrayBuffer();
        durations.push(performance.now() - requestStarted);
        statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
        if (!response.ok) errors.push({ path, status: response.status });
      } catch (error) {
        durations.push(performance.now() - requestStarted);
        errors.push({ path, error: error.name || 'RequestError' });
        statusCounts.transport = (statusCounts.transport || 0) + 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(config.concurrency, config.requests) }, worker));

  const elapsedMs = performance.now() - startedAt;
  const sorted = durations.toSorted((a, b) => a - b);
  const errorRate = errors.length / config.requests;
  const requestsPerSecond = config.requests / (elapsedMs / 1_000);
  const metrics = {
    requests: config.requests,
    concurrency: config.concurrency,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: Number(requestsPerSecond.toFixed(2)),
    latencyMs: {
      p50: Number(percentile(sorted, 0.50).toFixed(2)),
      p95: Number(percentile(sorted, 0.95).toFixed(2)),
      p99: Number(percentile(sorted, 0.99).toFixed(2)),
      max: Number((sorted.at(-1) || 0).toFixed(2)),
    },
    errors: errors.length,
    errorRate: Number(errorRate.toFixed(6)),
    statusCounts,
  };
  const failures = [];
  if (metrics.latencyMs.p95 > config.p95LimitMs) failures.push(`p95 ${metrics.latencyMs.p95}ms > ${config.p95LimitMs}ms`);
  if (metrics.latencyMs.p99 > config.p99LimitMs) failures.push(`p99 ${metrics.latencyMs.p99}ms > ${config.p99LimitMs}ms`);
  if (errorRate > config.maxErrorRate) failures.push(`error rate ${metrics.errorRate} > ${config.maxErrorRate}`);
  if (requestsPerSecond < config.minRequestsPerSecond) failures.push(`throughput ${metrics.requestsPerSecond}rps < ${config.minRequestsPerSecond}rps`);
  return {
    checkedAt: new Date().toISOString(),
    target: config.baseUrl.origin,
    paths: config.paths,
    limits: {
      p95Ms: config.p95LimitMs,
      p99Ms: config.p99LimitMs,
      maxErrorRate: config.maxErrorRate,
      minRequestsPerSecond: config.minRequestsPerSecond,
    },
    metrics,
    failures,
    passed: failures.length === 0,
  };
};

const main = async () => {
  try {
    const report = await runCapacityCheck(resolveCapacityConfig());
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`Capacity check failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
