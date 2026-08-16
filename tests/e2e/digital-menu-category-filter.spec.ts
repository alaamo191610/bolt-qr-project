import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const FIXTURE_PATH = '/tmp/bolt-qr-real-backend-fixture.json';

type Fixture = { email: string; password: string };

const readFixture = async (): Promise<Fixture> => JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));

// On narrow viewports the nav lives inside an off-canvas sidebar that starts
// closed; on wide viewports it's a persistent header row and this toggle is
// hidden entirely. See tests/e2e/admin-accessibility.spec.ts.
const navigateTo = async (page: Page, name: string) => {
  const sidebarToggle = page.getByRole('button', { name: 'Open menu' });
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
  }
  await page.getByRole('button', { name, exact: true }).click();
};

// Regression test for a real bug found while typing menuService.ts's API
// responses: the category <select> emits String(cat.id), but item.category_id
// (an untyped `any` before) was the raw numeric id from the API, so
// `item.category_id === selectedCategory` was `3 === "3"` - always false.
// Selecting any specific category silently emptied the item list.
test('selecting a specific category still shows its items', async ({ page }) => {
  const fixture = await readFixture();
  await page.goto('/');
  await page.getByLabel('Email Address').fill(fixture.email);
  await page.getByLabel('Password').fill(fixture.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'QR Studio' })).toBeVisible();

  await navigateTo(page, 'Digital Menu');
  await expect(page.getByText('Real E2E Burger')).toBeVisible();

  await page.getByLabel('Pick a category').selectOption({ label: 'Real E2E Category' });

  await expect(page.getByText('Real E2E Burger')).toBeVisible();
});
