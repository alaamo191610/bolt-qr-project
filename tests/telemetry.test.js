import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  redactTelemetryString,
  resolveServerTelemetryConfig,
  scrubTelemetryEvent,
} from '../server/telemetry.js';
import { createRequestContextMiddleware } from '../server/requestContext.js';

test('server telemetry is disabled by default and validates deployment metadata', () => {
  assert.deepEqual(resolveServerTelemetryConfig({ NODE_ENV: 'test' }), {
    enabled: false,
    dsn: '',
    environment: 'test',
    release: 'development',
    tracesSampleRate: 0,
  });

  assert.deepEqual(resolveServerTelemetryConfig({
    NODE_ENV: 'production',
    SENTRY_DSN: 'https://public-key@errors.example.com/123',
    SENTRY_ENVIRONMENT: 'pilot',
    SENTRY_TRACES_SAMPLE_RATE: '0.05',
    RELEASE_VERSION: '20260815-deadbeef',
  }), {
    enabled: true,
    dsn: 'https://public-key@errors.example.com/123',
    environment: 'pilot',
    release: '20260815-deadbeef',
    tracesSampleRate: 0.05,
  });

  assert.throws(
    () => resolveServerTelemetryConfig({ NODE_ENV: 'production', RELEASE_VERSION: 'release one' }),
    /validated RELEASE_VERSION/,
  );
  assert.throws(
    () => resolveServerTelemetryConfig({
      NODE_ENV: 'production',
      RELEASE_VERSION: 'release-1',
      SENTRY_DSN: 'http://public-key@errors.example.com/123',
    }),
    /valid HTTPS Sentry DSN/,
  );
  assert.throws(
    () => resolveServerTelemetryConfig({
      NODE_ENV: 'production',
      RELEASE_VERSION: 'release-1',
      SENTRY_TRACES_SAMPLE_RATE: '0.21',
    }),
    /between 0 and 0.2/,
  );
});

test('server telemetry scrubber removes authentication, customer, and database secrets', () => {
  const breadcrumbs = Array.from({ length: 35 }, (_, index) => ({
    timestamp: index,
    category: 'request',
    message: `customer-${index}@example.com Bearer token-${index}`,
    data: {
      authorization: `Bearer token-${index}`,
      safeCounter: index,
      request_url: 'https://api.example.com/menu?arbitrary=private-value',
    },
  }));
  const scrubbed = scrubTelemetryEvent({
    user: { id: 'customer-1', email: 'customer@example.com' },
    request: {
      method: 'POST',
      url: 'https://api.example.com/api/orders?cap=secret-capability',
      headers: { authorization: 'Bearer private-token' },
      data: { note: 'allergy details' },
      cookies: { session: 'private-cookie' },
    },
    message: 'Failed for customer@example.com with Bearer private-token',
    exception: { values: [{ type: 'Error', value: 'postgresql://user:pass@localhost/app failed' }] },
    tags: { organization_id: 'org-1', accessToken: 'private-token' },
    extra: { safeCounter: 2, customerEmail: 'customer@example.com', note: 'private note' },
    contexts: { order: { id: 'order-1', payload: { basket: ['secret'] } } },
    breadcrumbs,
  });

  assert.equal(scrubbed.user, undefined);
  assert.deepEqual(scrubbed.request, {
    method: 'POST',
    url: 'https://api.example.com/api/orders',
  });
  assert.equal(scrubbed.tags.organization_id, 'org-1');
  assert.equal(scrubbed.tags.accessToken, '[Filtered]');
  assert.equal(scrubbed.extra.safeCounter, 2);
  assert.equal(scrubbed.extra.customerEmail, '[Filtered]');
  assert.equal(scrubbed.extra.note, '[Filtered]');
  assert.equal(scrubbed.contexts.order.payload, '[Filtered]');
  assert.equal(scrubbed.breadcrumbs.length, 30);
  assert.equal(scrubbed.breadcrumbs[0].timestamp, 5);
  assert.equal(scrubbed.breadcrumbs[0].data.request_url, 'https://api.example.com/menu');

  const serialized = JSON.stringify(scrubbed);
  for (const secret of ['customer@example.com', 'private-token', 'secret-capability', 'user:pass', 'allergy details']) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(redactTelemetryString('Authorization: Bearer abc/123=='), 'Authorization: Bearer [Filtered]');
  assert.equal(redactTelemetryString('{"userId":"user-123","status":500}'), '{"userId":"[Filtered]","status":500}');
});

test('request context reports generic non-health 5xx responses once', () => {
  const failures = [];
  const createResponse = () => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.setHeader = () => {};
    response.json = body => body;
    return response;
  };
  const middleware = createRequestContextMiddleware({
    logger: () => {},
    clock: () => 100,
    onServerError: (error, context) => failures.push({ error, context }),
  });

  const request = {
    method: 'GET',
    path: '/api/orders?token=private',
    auth: { organizationId: 'org-1' },
    get: () => 'request-1',
  };
  const response = createResponse();
  middleware(request, response, () => {});
  response.statusCode = 503;
  response.emit('finish');

  assert.equal(failures.length, 1);
  assert.equal(failures[0].error.message, 'HTTP 503 response');
  assert.deepEqual(failures[0].context, {
    requestId: 'request-1',
    organizationId: 'org-1',
    method: 'GET',
    path: '/api/orders?token=private',
  });

  const healthResponse = createResponse();
  middleware({ ...request, path: '/api/health/ready' }, healthResponse, () => {});
  healthResponse.statusCode = 503;
  healthResponse.emit('finish');
  assert.equal(failures.length, 1);
});
