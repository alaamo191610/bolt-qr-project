import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|dsn|email|phone|address|name|note|body|payload|basket|customer|user)/iu;
const FILTERED = '[Filtered]';

let telemetryEnabled = false;

export const resolveClientTelemetryConfig = (env: Record<string, unknown>) => {
  const dsn = String(env.VITE_SENTRY_DSN || '').trim();
  const environment = String(env.VITE_SENTRY_ENVIRONMENT || (env.PROD ? 'pilot' : 'development')).trim();
  const release = String(env.VITE_RELEASE_VERSION || (env.PROD ? '' : 'development')).trim();

  if (!ENVIRONMENT_PATTERN.test(environment)) {
    throw new Error('VITE_SENTRY_ENVIRONMENT has an invalid format');
  }
  if (!RELEASE_PATTERN.test(release)) {
    throw new Error('VITE_RELEASE_VERSION has an invalid format');
  }
  if (dsn) {
    let parsed: URL;
    try {
      parsed = new URL(dsn);
    } catch {
      throw new Error('VITE_SENTRY_DSN must be a valid HTTPS Sentry DSN');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || !parsed.username) {
      throw new Error('VITE_SENTRY_DSN must be a valid HTTPS Sentry DSN');
    }
  }
  return { enabled: Boolean(dsn), dsn, environment, release } as const;
};

export const redactClientTelemetryString = (value: unknown) => String(value)
  .replace(/Bearer\s+\S+/giu, `Bearer ${FILTERED}`)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, FILTERED)
  .replace(/([?&](?:cap|token|secret|password|code|key)=)[^&\s]*/giu, `$1${FILTERED}`)
  .replace(/("(?:user|customer)(?:_?id|name)?"\s*:\s*")[^"]+/giu, `$1${FILTERED}`)
  .slice(0, 2_048);

const scrubValue = (value: unknown, depth = 0, key = ''): unknown => {
  if (SENSITIVE_KEY.test(key)) return FILTERED;
  if (/(?:^|_)(?:url|uri|path)$/iu.test(key)) return scrubUrl(value);
  if (typeof value === 'string') return redactClientTelemetryString(value);
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

const scrubUrl = (value: unknown) => {
  try {
    const url = new URL(String(value), window.location.origin);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return redactClientTelemetryString(value).replace(/\?.*$/u, '');
  }
};

export const scrubClientTelemetryEvent = (event: ErrorEvent): ErrorEvent => {
  const scrubbed = { ...event };
  delete scrubbed.user;
  if (scrubbed.request) {
    scrubbed.request = {
      method: scrubbed.request.method,
      url: scrubbed.request.url ? scrubUrl(scrubbed.request.url) : undefined,
    };
  }
  if (scrubbed.message) scrubbed.message = redactClientTelemetryString(scrubbed.message);
  if (scrubbed.transaction) scrubbed.transaction = scrubUrl(scrubbed.transaction);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map(exception => ({
        ...exception,
        value: exception.value ? redactClientTelemetryString(exception.value) : exception.value,
      })),
    };
  }
  scrubbed.tags = scrubValue(scrubbed.tags || {}) as ErrorEvent['tags'];
  scrubbed.extra = scrubValue(scrubbed.extra || {}) as ErrorEvent['extra'];
  scrubbed.contexts = scrubValue(scrubbed.contexts || {}) as ErrorEvent['contexts'];
  scrubbed.breadcrumbs = (scrubbed.breadcrumbs || []).slice(-30).map(breadcrumb => ({
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
    category: breadcrumb.category,
    level: breadcrumb.level,
    message: breadcrumb.message ? redactClientTelemetryString(breadcrumb.message) : undefined,
    data: scrubValue(breadcrumb.data || {}) as Breadcrumb['data'],
  }));
  return scrubbed;
};

export const initializeClientTelemetry = (env: Record<string, unknown> = import.meta.env) => {
  const config = resolveClientTelemetryConfig(env);
  telemetryEnabled = config.enabled;
  if (!config.enabled) return config;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: 0,
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
    maxBreadcrumbs: 30,
    beforeSend: event => scrubClientTelemetryEvent(event),
    beforeBreadcrumb: breadcrumb => (
      breadcrumb.category === 'console' ? null : scrubValue(breadcrumb) as typeof breadcrumb
    ),
    initialScope: { tags: { service: 'qr-web' } },
  });
  return config;
};

export const captureReactError = (
  error: Error,
  { scope, componentStack }: { scope: 'customer' | 'admin'; componentStack?: string | null },
) => {
  if (!telemetryEnabled) return null;
  return Sentry.withScope(sentryScope => {
    sentryScope.setTag('surface', 'react');
    sentryScope.setTag('ui_scope', scope);
    if (componentStack) sentryScope.setContext('react', { componentStack: redactClientTelemetryString(componentStack) });
    return Sentry.captureException(error);
  });
};
