import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRateLimiter } from '../server/rateLimit.js';
import { normalizeErrorResponse } from '../server/errors.js';

let app;
let httpServer;
let baseUrl;

before(async () => {
  ({ app } = await import('../server/index.js'));
  httpServer = createServer(app);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
});

test('live health endpoint is available through the HTTP harness', async () => {
  const response = await fetch(`${baseUrl}/api/health/live`, {
    headers: { 'X-Request-Id': 'http-harness-1' },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok' });
  assert.equal(response.headers.get('x-request-id'), 'http-harness-1');
});

test('unknown routes return the stable redacted error contract', async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`, {
    headers: { 'X-Request-Id': 'http-harness-2' },
  });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(body.requestId, 'http-harness-2');
  assert.equal(body.error, 'Request failed');
  assert.equal(body.stack, undefined);
});

test('rate limiter has deterministic retry metadata and bounded storage', () => {
  let now = 1_000;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    max: 1,
    maxEntries: 2,
    clock: () => now,
    key: request => request.key,
  });
  const run = key => new Promise(resolve => limiter({ key }, {}, error => resolve(error)));

  return (async () => {
    assert.equal(await run('a'), undefined);
    const limited = await run('a');
    assert.equal(limited.status, 429);
    assert.equal(limited.code, 'RATE_LIMITED');
    assert.equal(limited.retryAfter, 10);
    assert.equal(limiter.size(), 1);

    assert.equal(await run('b'), undefined);
    assert.equal(await run('c'), undefined);
    assert.equal(limiter.size(), 2);

    now = 11_001;
    assert.equal(await run('a'), undefined);
    assert.equal(limiter.size(), 1);
    limiter.reset();
    assert.equal(limiter.size(), 0);
  })();
});

test('server errors never expose diagnostic details', () => {
  const response = normalizeErrorResponse({
    error: 'Prisma: password=super-secret relation does not exist',
    stack: 'sensitive stack trace',
  }, 500, 'redaction-1');

  assert.deepEqual(response, {
    error: 'Internal server error',
    code: 'SERVER_ERROR',
    requestId: 'redaction-1',
  });
});
