import type { PosBootstrap, PosCheck, PosMenuOptions, PosReceipt } from './types';

const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const apiRoot = (import.meta.env.VITE_API_URL || `${protocol}//${hostname}:3000/api`).replace(/\/$/, '');
const baseUrl = `${apiRoot}/pos/v1`;
const tokenKey = 'pos_access_token';

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
};

export const posService = {
  hasSession: () => Boolean(localStorage.getItem(tokenKey)),
  logout: () => localStorage.removeItem(tokenKey),
  getAccess: (branchId: string) => request<{ branch: { id: string; name: string }; employees: Array<{ id: string; name: string }> }>(`/access/${branchId}`),
  async login(branchId: string, employeeId: string, pin: string) {
    const response = await request<{ token: string }>('/auth/pin', {
      method: 'POST', body: JSON.stringify({ branchId, employeeId, pin }),
    });
    localStorage.setItem(tokenKey, response.token);
  },
  bootstrap: () => request<PosBootstrap>('/bootstrap'),
  openShift: (registerId: string, openingCash: number) => request<PosBootstrap['currentShift']>('/shifts/open', {
    method: 'POST', body: JSON.stringify({ registerId, openingCash }),
  }),
  createCheck: () => request<PosCheck>('/checks', { method: 'POST', body: JSON.stringify({ guestCount: 1 }) }),
  getMenuOptions: (menuId: number) => request<PosMenuOptions>(`/menus/${menuId}/options`),
  addItem: (checkId: string, menuId: number, expectedVersion: number, options: { modifierOptionIds?: number[]; removedIngredientIds?: number[]; note?: string } = {}) => request<PosCheck>(`/checks/${checkId}/items`, {
    method: 'POST', body: JSON.stringify({ menuId, quantity: 1, expectedVersion, ...options }),
  }),
  updateItem: (checkId: string, itemId: number, quantity: number, expectedVersion: number) => request<PosCheck>(`/checks/${checkId}/items/${itemId}`, {
    method: 'PATCH', body: JSON.stringify({ quantity, expectedVersion }),
  }),
  voidItem: (checkId: string, itemId: number, expectedVersion: number, reason: string) => request<PosCheck>(`/checks/${checkId}/items/${itemId}`, {
    method: 'DELETE', body: JSON.stringify({ expectedVersion, reason }),
  }),
  getCheck: (checkId: string) => request<PosCheck>(`/checks/${checkId}`),
  getReceipt: (checkId: string) => request<PosReceipt>(`/checks/${checkId}/receipt`),
  payCash: (checkId: string, amount: number) => request(`/checks/${checkId}/payments`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ method: 'CASH', amount }),
  }),
};
