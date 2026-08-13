import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, handleResponse } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('ApiError response contract', () => {
  it('preserves the server code, request ID, and retry delay', async () => {
    const response = new Response(JSON.stringify({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      requestId: 'req-123',
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
    });

    await expect(handleResponse(response)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Too many requests',
      status: 429,
      code: 'RATE_LIMITED',
      requestId: 'req-123',
      retryAfter: 30,
    });
  });

  it('uses safe fallback codes when an error body has no machine-readable code', async () => {
    const response = new Response(JSON.stringify({ error: 'Not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-456' },
    });

    await expect(handleResponse(response)).rejects.toMatchObject({
      status: 403,
      code: 'ACCESS_DENIED',
      requestId: 'req-456',
    });
  });

  it('turns network failures into a typed retryable client error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api.get('/health')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
    } satisfies Partial<ApiError>);
  });
});
