import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, tokenStore } from './api';
import { superAdminService } from './superAdminService';

beforeEach(() => {
  tokenStore.set('superAdmin', 'super-admin-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('superAdminService error propagation', () => {
  it('throws a typed ApiError with AUTHENTICATION_REQUIRED on a 401, not a plain Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(superAdminService.getStats()).rejects.toMatchObject({
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

    await expect(superAdminService.getRestaurants()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      code: 'SERVER_ERROR',
    } satisfies Partial<ApiError>);
  });
});

describe('superAdminService token namespace isolation (G9)', () => {
  it('sends the superAdmin token, never the restaurant admin token, on SuperAdmin requests', async () => {
    tokenStore.set('restaurant', 'restaurant-admin-token');
    tokenStore.set('superAdmin', 'the-real-super-admin-token');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ totalRestaurants: 0, activeRestaurants: 0, totalRevenue: 0, growth: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await superAdminService.getStats();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer the-real-super-admin-token');
    expect(headers.Authorization).not.toContain('restaurant-admin-token');
  });

  it('login does not attach any Authorization header (no session exists yet)', async () => {
    tokenStore.set('restaurant', 'restaurant-admin-token');
    tokenStore.set('superAdmin', 'stale-super-admin-token');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'new-token', user: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await superAdminService.login('admin@example.com', 'password');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
