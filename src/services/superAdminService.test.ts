import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { superAdminService } from './superAdminService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('superAdminService error propagation', () => {
  it('throws a typed ApiError with AUTHENTICATION_REQUIRED on a 401, not a plain Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(superAdminService.getStats('stale-token')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    } satisfies Partial<ApiError>);
  });

  it('throws a typed ApiError with SERVER_ERROR on a 500, distinguishable from a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(superAdminService.getRestaurants('valid-token')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      code: 'SERVER_ERROR',
    } satisfies Partial<ApiError>);
  });
});
