#!/usr/bin/env node
import {
  captureSyntheticAlert,
  flushServerTelemetry,
  initializeServerTelemetry,
  isServerTelemetryEnabled,
} from '../../server/telemetry.js';

const healthUrlValue = String(process.env.UPTIME_HEALTH_URL || '').trim();
if (!healthUrlValue) {
  throw new Error('UPTIME_HEALTH_URL is required');
}

let healthUrl;
try {
  healthUrl = new URL(healthUrlValue);
} catch {
  throw new Error('UPTIME_HEALTH_URL must be a valid URL');
}
const allowHttp = process.env.OBSERVABILITY_ALLOW_HTTP === 'true' && process.env.NODE_ENV !== 'production';
if (healthUrl.protocol !== 'https:' && !(allowHttp && healthUrl.protocol === 'http:')) {
  throw new Error('UPTIME_HEALTH_URL must use HTTPS');
}
if (healthUrl.username || healthUrl.password || healthUrl.search || healthUrl.hash) {
  throw new Error('UPTIME_HEALTH_URL must not contain credentials, query parameters, or fragments');
}

const telemetryConfig = initializeServerTelemetry();
if (!isServerTelemetryEnabled()) {
  throw new Error('SENTRY_DSN must be configured before synthetic validation');
}

const response = await fetch(healthUrl, {
  headers: { Accept: 'application/json', 'User-Agent': 'qr-observability-check/1' },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) {
  throw new Error(`Readiness probe failed with HTTP ${response.status}`);
}
const health = await response.json();
if (health?.status !== 'ready' || health?.database !== 'ok') {
  throw new Error('Readiness probe returned an unexpected contract');
}
const expectedRelease = String(process.env.RELEASE_VERSION || '').trim();
if (expectedRelease && health.release !== expectedRelease) {
  throw new Error('Readiness probe release does not match RELEASE_VERSION');
}

const eventId = captureSyntheticAlert();
if (!eventId || !(await flushServerTelemetry(10_000))) {
  throw new Error('Synthetic Sentry event was not accepted by the SDK transport');
}

console.log(JSON.stringify({
  event: 'observability_validation_sent',
  eventId,
  environment: telemetryConfig.environment,
  release: telemetryConfig.release,
  readiness: 'ready',
}));
