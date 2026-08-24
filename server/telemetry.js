import * as Sentry from '@sentry/node';

const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|dsn|email|phone|address|name|note|body|payload|basket|customer|user)/iu;
const FILTERED = '[Filtered]';

let telemetryEnabled = false;
let telemetryRelease = 'development';

const boundedSampleRate = value => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.2) {
    throw new Error('SENTRY_TRACES_SAMPLE_RATE must be between 0 and 0.2');
  }
  return parsed;
};

export const resolveServerTelemetryConfig = (env = process.env) => {
  const dsn = String(env.SENTRY_DSN || '').trim();
  const environment = String(env.SENTRY_ENVIRONMENT || (env.NODE_ENV === 'production' ? 'pilot' : env.NODE_ENV || 'development')).trim();
  const release = String(env.RELEASE_VERSION || (env.NODE_ENV === 'production' ? '' : 'development')).trim();

  if (!ENVIRONMENT_PATTERN.test(environment)) {
    throw new Error('SENTRY_ENVIRONMENT must use 1-64 letters, numbers, dots, underscores, or hyphens');
  }
  if (!RELEASE_PATTERN.test(release)) {
    throw new Error('Sentry release must use the validated RELEASE_VERSION format');
  }
  if (dsn) {
    let parsed;
    try {
      parsed = new URL(dsn);
    } catch {
      throw new Error('SENTRY_DSN must be a valid HTTPS Sentry DSN');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || !parsed.username) {
      throw new Error('SENTRY_DSN must be a valid HTTPS Sentry DSN');
    }
  }

  return Object.freeze({
    enabled: Boolean(dsn),
    dsn,
    environment,
    release,
    tracesSampleRate: boundedSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
  });
};

export const redactTelemetryString = value => String(value)
  .replace(/Bearer\s+\S+/giu, `Bearer ${FILTERED}`)
  .replace(/\b(?:postgres(?:ql)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/giu, match => `${match.split('://')[0]}://${FILTERED}:${FILTERED}@`)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, FILTERED)
  .replace(/([?&](?:cap|token|secret|password|code|key)=)[^&\s]*/giu, `$1${FILTERED}`)
  .replace(/("(?:user|customer)(?:_?id|name)?"\s*:\s*")[^"]+/giu, `$1${FILTERED}`)
  .slice(0, 2_048);

const scrubValue = (value, depth = 0, key = '') => {
  if (SENSITIVE_KEY.test(key)) return FILTERED;
  if (/(?:^|_)(?:url|uri|path)$/iu.test(key)) return scrubUrl(value);
  if (typeof value === 'string') return redactTelemetryString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (depth >= 4) return '[Truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => scrubValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [
      childKey,
      scrubValue(childValue, depth + 1, childKey),
    ]));
  }
  return String(value).slice(0, 256);
};

const scrubUrl = value => {
  try {
    const url = new URL(String(value));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return redactTelemetryString(value).replace(/\?.*$/u, '');
  }
};

export const scrubTelemetryEvent = event => {
  const scrubbed = { ...event };
  delete scrubbed.user;
  if (scrubbed.request) {
    scrubbed.request = {
      method: scrubbed.request.method,
      url: scrubbed.request.url ? scrubUrl(scrubbed.request.url) : undefined,
    };
  }
  if (scrubbed.message) scrubbed.message = redactTelemetryString(scrubbed.message);
  if (scrubbed.transaction) scrubbed.transaction = scrubUrl(scrubbed.transaction);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map(exception => ({
        ...exception,
        value: exception.value ? redactTelemetryString(exception.value) : exception.value,
      })),
    };
  }
  scrubbed.tags = scrubValue(scrubbed.tags || {});
  scrubbed.extra = scrubValue(scrubbed.extra || {});
  scrubbed.contexts = scrubValue(scrubbed.contexts || {});
  scrubbed.breadcrumbs = (scrubbed.breadcrumbs || []).slice(-30).map(breadcrumb => ({
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
    category: breadcrumb.category,
    level: breadcrumb.level,
    message: breadcrumb.message ? redactTelemetryString(breadcrumb.message) : undefined,
    data: scrubValue(breadcrumb.data || {}),
  }));
  return scrubbed;
};

export const initializeServerTelemetry = ({ env = process.env, logger = console.info } = {}) => {
  const config = resolveServerTelemetryConfig(env);
  telemetryEnabled = config.enabled;
  telemetryRelease = config.release;
  if (!config.enabled) {
    logger(JSON.stringify({ event: 'sentry_disabled', service: 'api', release: config.release }));
    return config;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 3,
    },
    includeLocalVariables: false,
    maxBreadcrumbs: 30,
    beforeSend: scrubTelemetryEvent,
    beforeBreadcrumb: breadcrumb => (
      breadcrumb.category === 'console' ? null : scrubValue(breadcrumb)
    ),
    initialScope: {
      tags: { service: 'qr-api' },
    },
  });
  logger(JSON.stringify({
    event: 'sentry_initialized',
    service: 'api',
    environment: config.environment,
    release: config.release,
  }));
  return config;
};

export const captureServerException = (error, {
  requestId,
  organizationId,
  method,
  path,
  synthetic = false,
  fingerprint,
} = {}) => {
  if (!telemetryEnabled) return null;
  return Sentry.withScope(scope => {
    scope.setTag('surface', 'api');
    if (requestId) scope.setTag('request_id', requestId);
    if (organizationId) scope.setTag('organization_id', organizationId);
    if (method) scope.setTag('http_method', method);
    if (path) scope.setContext('http', { path: scrubUrl(path) });
    if (synthetic) scope.setTag('synthetic', 'true');
    if (fingerprint) scope.setFingerprint(fingerprint);
    return Sentry.captureException(error instanceof Error ? error : new Error('Unhandled server failure'));
  });
};

export const captureSyntheticAlert = () => {
  const error = new Error('QR synthetic Sentry alert');
  error.name = 'qrSyntheticAlert';
  return captureServerException(error, {
    synthetic: true,
    path: 'operator-local-validation',
    fingerprint: ['qr-observability-validation', telemetryRelease],
  });
};

export const flushServerTelemetry = async (timeoutMs = 2_000) => {
  if (!telemetryEnabled) return true;
  return Sentry.flush(timeoutMs);
};

export const isServerTelemetryEnabled = () => telemetryEnabled;
