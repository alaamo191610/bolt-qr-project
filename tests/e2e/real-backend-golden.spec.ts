import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const BACKEND_URL = 'http://127.0.0.1:3100';
const FIXTURE_PATH = '/tmp/qr-real-backend-fixture.json';

type Fixture = {
  adminId: string;
  email: string;
  password: string;
  organizationId: string;
  tableId: number;
  tableCode: string;
  menuId: number;
};

const json = async response => response.json();

test('real backend golden flow creates, tracks, and revokes a QR order', async ({ page, request, isMobile }) => {
  test.skip(isMobile, 'The mocked QR suite covers mobile; this backend-backed golden flow runs once on desktop.');

  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8')) as Fixture;
  const login = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: fixture.email, password: fixture.password },
  });
  expect(login.status()).toBe(200);
  const loginBody = await json(login);

  const rotate = await request.post(`${BACKEND_URL}/api/tables/${fixture.tableId}/capability/rotate`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  expect(rotate.status()).toBe(200);
  const capabilityBody = await json(rotate);
  expect(capabilityBody.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const cartKey = `qr-cart-v2:${fixture.adminId}:${fixture.tableCode}`;
  await page.addInitScript(([key, menuId]) => {
    window.sessionStorage.setItem(key as string, JSON.stringify([{
      id: menuId,
      name_en: 'Real E2E Burger',
      name_ar: 'برغر الاختبار الحقيقي',
      price: 10,
      available: true,
      quantity: 1,
      ingredients_details: [],
      custom_ingredients: [],
      selected_modifiers: [],
    }]));
  }, [cartKey, fixture.menuId]);

  const tableSessionResponse = page.waitForResponse(response =>
    response.url() === `${BACKEND_URL}/api/public/table-session`
    && response.request().method() === 'POST');
  await page.goto(`/menu?table=${encodeURIComponent(fixture.tableCode)}&restaurant=${fixture.adminId}&cap=${capabilityBody.capability}`);
  const tableSession = await json(await tableSessionResponse);
  expect(tableSession.organizationId).toBe(fixture.organizationId);
  expect(tableSession.table.id).toBe(fixture.tableId);

  await expect(page.getByText('Real E2E Burger')).toBeVisible();
  await page.locator('#header-cart-anchor').click();
  await page.getByRole('dialog').getByRole('button', { name: 'View order 🧾', exact: true }).click();
  const placeOrder = page.getByRole('button', { name: /place order/i });
  await expect(placeOrder).toBeEnabled();

  const orderResponsePromise = page.waitForResponse(response =>
    response.url() === `${BACKEND_URL}/api/orders`
    && response.request().method() === 'POST');
  await placeOrder.click();
  const orderResponse = await orderResponsePromise;
  expect(orderResponse.status()).toBe(201);
  const order = await json(orderResponse);
  expect(order.organization_id).toBe(fixture.organizationId);
  expect(order.table_id).toBe(fixture.tableId);
  expect(order.tracking_token).toBeTruthy();
  expect(orderResponse.request().headers()['authorization']).toBe(`Bearer ${tableSession.token}`);
  expect(orderResponse.request().headers()['idempotency-key']).toBeTruthy();
  await expect(page.getByText(new RegExp(`Order #${order.id}`))).toBeVisible();

  const status = await request.get(`${BACKEND_URL}/api/public/orders/${order.id}/status`, {
    headers: { Authorization: `Bearer ${order.tracking_token}` },
  });
  expect(status.status()).toBe(200);
  const statusBody = await json(status);
  expect(statusBody.id).toBe(order.id);
  expect(statusBody.status).toBe(order.status);

  // Rotating the QR capability revokes the already exchanged table session.
  const secondRotate = await request.post(`${BACKEND_URL}/api/tables/${fixture.tableId}/capability/rotate`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  expect(secondRotate.status()).toBe(200);
  const revokedSessionOrder = await request.post(`${BACKEND_URL}/api/orders`, {
    headers: {
      Authorization: `Bearer ${tableSession.token}`,
      'Idempotency-Key': `revoked-${Date.now()}`,
    },
    data: {
      type: 'dine_in',
      items: [{ menuId: fixture.menuId, quantity: 1 }],
    },
  });
  expect(revokedSessionOrder.status()).toBe(403);
  expect((await revokedSessionOrder.json()).code).toBe('TABLE_SESSION_INVALID');
});
