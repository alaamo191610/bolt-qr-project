import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The golden path required by the M2 exit gate: menu -> QR/capability ->
// customer order -> tracking/status, run with zero network mocking against
// the real server/index.js and a disposable Postgres database seeded by
// tests/e2e-golden/seedGoldenBackend.mjs (see playwright.golden.config.ts).
interface GoldenFixture {
  apiBaseUrl: string;
  adminId: string;
  tableCode: string;
  capability: string;
  adminEmail: string;
  adminPassword: string;
}

const FIXTURE_PATH = process.env.GOLDEN_E2E_FIXTURE_PATH
  || path.resolve(process.cwd(), 'tests/e2e-golden/.fixture.json');

const readFixture = (): GoldenFixture => JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

// Mobile viewport so the header cart button opens the CartDrawer directly
// instead of the desktop popover, matching the mocked capability spec.
test.use({ viewport: { width: 390, height: 844 } });

test('QR capability exchanges for a real session and creates a real order', async ({ page, request }) => {
  const fixture = readFixture();

  await page.goto(`/menu?table=${fixture.tableCode}&restaurant=${fixture.adminId}&cap=${fixture.capability}`);

  await expect(page.getByText('Golden Burger')).toBeVisible();
  // Scoped to the real <button>, not the surrounding role="button" card
  // (whose computed accessible name also contains this text via the
  // nested button's aria-label, which trips getByRole's strict mode).
  await page.locator('button[aria-label*="Add to cart" i]').click();

  await page.locator('#header-cart-anchor').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // The real capability -> table-session exchange is an actual network
  // round trip here (no mock), so give it real time to settle.
  const placeOrder = page.getByRole('button', { name: /place order/i });
  await expect(placeOrder).toBeEnabled({ timeout: 10_000 });
  await placeOrder.click();

  await expect(page.getByText(/order placed/i)).toBeVisible({ timeout: 15_000 });
  const orderHeading = await page.getByText(/^order #\d+/i).textContent();
  const orderId = orderHeading?.match(/\d+/)?.[0];
  expect(orderId).toBeTruthy();

  // Strongest proof of real integration: confirm the order through a
  // second, independent path - an authenticated admin API call against the
  // same live backend, with no mocking anywhere in this chain either.
  const login = await request.post(`${fixture.apiBaseUrl}/auth/login`, {
    data: { email: fixture.adminEmail, password: fixture.adminPassword },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();

  const ordersResponse = await request.get(`${fixture.apiBaseUrl}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(ordersResponse.ok()).toBeTruthy();
  // GET /api/orders returns a cursor-paginated envelope, not a bare array -
  // see docs/contracts/pagination-and-analytics.md.
  const { items } = (await ordersResponse.json()) as {
    items: Array<{ id: number; type?: string }>;
    pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
  };
  const created = items.find((order) => String(order.id) === orderId);
  expect(created).toBeTruthy();
  expect(created?.type).toBe('dine_in');
});
