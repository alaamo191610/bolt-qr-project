import type { ErrorEvent } from '@sentry/react';
import { describe, expect, it } from 'vitest';
import {
  redactClientTelemetryString,
  resolveClientTelemetryConfig,
  scrubClientTelemetryEvent,
} from './telemetry';

describe('client telemetry privacy boundary', () => {
  it('is disabled without a DSN and validates production release metadata', () => {
    expect(resolveClientTelemetryConfig({ PROD: false })).toEqual({
      enabled: false,
      dsn: '',
      environment: 'development',
      release: 'development',
    });
    expect(resolveClientTelemetryConfig({
      PROD: true,
      VITE_SENTRY_DSN: 'https://public-key@errors.example.com/456',
      VITE_SENTRY_ENVIRONMENT: 'pilot',
      VITE_RELEASE_VERSION: '20260815-deadbeef',
    })).toEqual({
      enabled: true,
      dsn: 'https://public-key@errors.example.com/456',
      environment: 'pilot',
      release: '20260815-deadbeef',
    });
    expect(() => resolveClientTelemetryConfig({ PROD: true })).toThrow(/VITE_RELEASE_VERSION/);
    expect(() => resolveClientTelemetryConfig({
      PROD: true,
      VITE_RELEASE_VERSION: 'release-1',
      VITE_SENTRY_DSN: 'http://public-key@errors.example.com/456',
    })).toThrow(/valid HTTPS Sentry DSN/);
  });

  it('removes user, request payload, credentials, email, notes, and query secrets', () => {
    const event = {
      user: { id: 'customer-1', email: 'customer@example.com' },
      request: {
        method: 'POST',
        url: 'https://app.example.com/order?cap=private-capability',
        headers: { Authorization: 'Bearer private-token' },
        data: { note: 'private order note' },
      },
      message: 'customer@example.com failed with Bearer private-token',
      tags: { release_channel: 'pilot', sessionToken: 'private-token' },
      extra: { safeCounter: 2, customerEmail: 'customer@example.com' },
      contexts: { order: { id: 'order-1', body: { basket: ['secret'] } } },
      breadcrumbs: Array.from({ length: 35 }, (_, index) => ({
        timestamp: index,
        message: `customer-${index}@example.com`,
        data: {
          authorization: `Bearer private-${index}`,
          safeCounter: index,
          request_url: 'https://app.example.com/menu?arbitrary=private-value',
        },
      })),
    } as unknown as ErrorEvent;

    const scrubbed = scrubClientTelemetryEvent(event);
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toEqual({ method: 'POST', url: 'https://app.example.com/order' });
    expect(scrubbed.tags).toEqual({ release_channel: 'pilot', sessionToken: '[Filtered]' });
    expect(scrubbed.extra).toEqual({ safeCounter: 2, customerEmail: '[Filtered]' });
    expect(scrubbed.contexts?.order).toEqual({ id: 'order-1', body: '[Filtered]' });
    expect(scrubbed.breadcrumbs).toHaveLength(30);
    expect(scrubbed.breadcrumbs?.[0].timestamp).toBe(5);
    expect(scrubbed.breadcrumbs?.[0].data?.request_url).toBe('https://app.example.com/menu');
    expect(JSON.stringify(scrubbed)).not.toMatch(/customer@example\.com|private-token|private-capability|private order note/);
    expect(redactClientTelemetryString('Authorization: Bearer abc/123==')).toBe('Authorization: Bearer [Filtered]');
    expect(redactClientTelemetryString('{"customerId":"customer-123"}')).toBe('{"customerId":"[Filtered]"}');
  });
});
