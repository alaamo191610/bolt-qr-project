import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, tokenStore } from './api';
import { superAdminService } from './superAdminService';

beforeEach(() => sessionStorage.clear());

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
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
  it('uses the HttpOnly-cookie credential mode and never sends a JavaScript bearer', async () => {
    tokenStore.set('restaurant', 'restaurant-admin-token');

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
    expect(headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('provisions with server-owned plan inputs and the HttpOnly SuperAdmin session', async () => {
    const response = {
      restaurant: { id: 'restaurant-1' },
      invitation: { token: 'secret', expiresAt: '2026-08-18T00:00:00.000Z', activationPath: '/activate?token=secret' },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await superAdminService.provisionRestaurant({
      ownerEmail: 'owner@example.com',
      restaurantName: 'Pilot Restaurant',
      plan: 'BASIC',
      status: 'TRIAL',
      trialEndsAt: '2026-08-18T00:00:00.000Z',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({
      ownerEmail: 'owner@example.com',
      restaurantName: 'Pilot Restaurant',
      plan: 'BASIC',
      status: 'TRIAL',
      trialEndsAt: '2026-08-18T00:00:00.000Z',
    });
  });

  it('login does not attach any Authorization header (no session exists yet)', async () => {
    tokenStore.set('restaurant', 'restaurant-admin-token');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mfaRequired: true, enrollmentRequired: false, challengeToken: 'challenge' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await superAdminService.login('admin@example.com', 'password');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('submits the MFA challenge without attaching an existing admin session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'new-token', user: { role: 'SUPER_ADMIN' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await superAdminService.verifyMfa('challenge', '123456');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ challengeToken: 'challenge', code: '123456' }));
  });
});
