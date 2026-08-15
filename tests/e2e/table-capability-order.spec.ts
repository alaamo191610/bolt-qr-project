import { expect, test, type Page, type Route } from '@playwright/test';

// Covers the QR capability -> table-session exchange -> dine-in order flow
// described in docs/contracts/table-capability.md. The frontend never talks
// to a real backend/Postgres here — every /api/* call the page makes is
// intercepted and answered with a fixed, contract-shaped response, so this
// exercises the real bundled app code (api.ts, tableService, orderService,
// CustomerMenu, CartDrawer) against the documented capability contract.

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TABLE_CODE = 'A1';
const TABLE_ID = 42;
const CAPABILITY = 'x'.repeat(43); // matches the 43-char base64url capability shape
const SESSION_TOKEN = 'table-session-jwt-fixture';

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Mobile viewport so CustomerMenu's onHeaderCartClick opens the CartDrawer
// directly instead of the desktop popover, keeping the flow to a minimum.
test.use({ viewport: { width: 390, height: 844 } });

async function mockMenuAndTable(page: Page) {
  await page.route('**/api/public/menus**', (route) =>
    json(route, 200, [
      {
        id: 'item-1',
        name_en: 'Burger',
        name_ar: 'برغر',
        price: 10,
        available: true,
        user_id: ADMIN_ID,
        ingredients_details: [],
        categories: null,
      },
    ])
  );

  await page.route('**/api/public/pricing**', (route) => json(route, 200, {}));
}

async function seedCart(page: Page) {
  const cartKey = `qr-cart-v2:${ADMIN_ID}:${TABLE_CODE}`;
  const cart = [
    {
      id: 'item-1',
      name_en: 'Burger',
      price: 10,
      quantity: 1,
      price_delta: 0,
      custom_ingredients: [],
      selected_modifiers: [],
      checkout_payload: {},
      notes: '',
    },
  ];
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key as string, value as string),
    [cartKey, JSON.stringify(cart)]
  );
}

async function openCartDrawer(page: Page) {
  await page.locator('#header-cart-anchor').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('QR capability -> table-session -> dine-in order', () => {
  test('a valid capability exchanges for a session and authorizes the order', async ({ page }) => {
    await mockMenuAndTable(page);
    await seedCart(page);

    await page.route('**/api/public/table-session', (route) =>
      json(route, 200, {
        token: SESSION_TOKEN,
        expiresIn: 1800,
        restaurantId: ADMIN_ID,
        organizationId: 'org-1',
        table: { id: TABLE_ID, code: TABLE_CODE },
      })
    );

    let orderRequest: {
      authorization: string | undefined;
      idempotencyKey: string | undefined;
      body: Record<string, unknown>;
    } | null = null;
    await page.route('**/api/orders', async (route) => {
      const request = route.request();
      orderRequest = {
        authorization: request.headers()['authorization'],
        idempotencyKey: request.headers()['idempotency-key'],
        body: request.postDataJSON(),
      };
      await json(route, 200, { id: 501, status: 'pending', order_number: 12, total: 10, tracking_token: 'track-1' });
    });

    // OrderConfirmation polls this on mount to reconcile status. This test
    // targets checkout authorization, not tracking, so keep it stable and
    // isolated from whatever backend may or may not be running locally.
    await page.route('**/api/public/orders/*/status', (route) =>
      json(route, 200, { id: 501, order_number: 12, status: 'pending', updated_at: new Date().toISOString() })
    );

    await page.goto(`/menu?table=${TABLE_CODE}&restaurant=${ADMIN_ID}&cap=${CAPABILITY}`);
    await openCartDrawer(page);

    const placeOrder = page.getByRole('button', { name: /place order/i });
    await expect(placeOrder).toBeEnabled();
    await placeOrder.click();

    // Order confirmation replaces the menu once the order is accepted.
    await expect(page.getByText('Order #501')).toBeVisible();

    expect(orderRequest).not.toBeNull();
    expect(orderRequest!.authorization).toBe(`Bearer ${SESSION_TOKEN}`);
    // Best-effort default pending Yazan's idempotency contract (see
    // orderService.ts) - a stable per-attempt key travels with the request.
    expect(orderRequest!.idempotencyKey).toMatch(/.+/);
    // Dine-in authorization comes entirely from the bearer token; the body
    // must not carry tableCode/adminId as a substitute proof of presence.
    expect(orderRequest!.body).not.toHaveProperty('tableCode');
    expect(orderRequest!.body).not.toHaveProperty('adminId');
    expect(orderRequest!.body).toMatchObject({ type: 'dine_in' });
  });

  test('a missing capability disables checkout instead of guessing identity', async ({ page }) => {
    await mockMenuAndTable(page);
    await seedCart(page);

    let tableSessionCalled = false;
    await page.route('**/api/public/table-session', (route) => {
      tableSessionCalled = true;
      return json(route, 200, {});
    });

    // No `cap` param — an old-style link or a stale QR without a capability.
    await page.goto(`/menu?table=${TABLE_CODE}&restaurant=${ADMIN_ID}`);
    await openCartDrawer(page);

    await expect(page.getByRole('button', { name: /place order/i })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText(/scan the table's qr code/i);
    expect(tableSessionCalled).toBe(false);
  });

  test('a failed submit followed by a reload retries with the same idempotency key', async ({ page }) => {
    await mockMenuAndTable(page);
    await seedCart(page);

    await page.route('**/api/public/table-session', (route) =>
      json(route, 200, {
        token: SESSION_TOKEN,
        expiresIn: 1800,
        restaurantId: ADMIN_ID,
        organizationId: 'org-1',
        table: { id: TABLE_ID, code: TABLE_CODE },
      })
    );

    const seenKeys: (string | undefined)[] = [];
    let attempt = 0;
    await page.route('**/api/orders', async (route) => {
      attempt += 1;
      seenKeys.push(route.request().headers()['idempotency-key']);
      if (attempt === 1) {
        // Simulate the exact case the contract exists for: the request may
        // have committed server-side, but the client never saw the response.
        await route.abort('failed');
        return;
      }
      await json(route, 200, { id: 501, status: 'pending', order_number: 12, total: 10, tracking_token: 'track-1' });
    });
    await page.route('**/api/public/orders/*/status', (route) =>
      json(route, 200, { id: 501, order_number: 12, status: 'pending', updated_at: new Date().toISOString() })
    );

    await page.goto(`/menu?table=${TABLE_CODE}&restaurant=${ADMIN_ID}&cap=${CAPABILITY}`);
    await openCartDrawer(page);

    await page.getByRole('button', { name: /place order/i }).click();
    // The failed attempt keeps the customer on the cart to retry.
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.reload();
    await openCartDrawer(page);
    await page.getByRole('button', { name: /place order/i }).click();
    await expect(page.getByText('Order #501')).toBeVisible();

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).toMatch(/.+/);
    expect(seenKeys[1]).toBe(seenKeys[0]);
  });

  test('a rotated/revoked capability disables checkout and reports it', async ({ page }) => {
    await mockMenuAndTable(page);
    await seedCart(page);

    await page.route('**/api/public/table-session', (route) =>
      json(route, 403, {
        error: 'Table session is invalid or expired',
        code: 'TABLE_SESSION_INVALID',
        requestId: 'req-1',
      })
    );

    await page.goto(`/menu?table=${TABLE_CODE}&restaurant=${ADMIN_ID}&cap=${CAPABILITY}`);
    await openCartDrawer(page);

    await expect(page.getByRole('button', { name: /place order/i })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText(/no longer valid/i);
  });
});
