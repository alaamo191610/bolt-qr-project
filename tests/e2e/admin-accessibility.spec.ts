import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const FIXTURE_PATH = '/tmp/qr-real-backend-fixture.json';

type Fixture = {
  email: string;
  password: string;
};

const readFixture = async (): Promise<Fixture> => JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));

// See tests/e2e/customer-menu-accessibility.spec.ts for why.
const freezeAnimations = (page: Page) => page.addStyleTag({
  content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }',
});

const signIn = async (page: Page, fixture: Fixture) => {
  await page.goto('/');
  await page.getByLabel('Email Address').fill(fixture.email);
  await page.getByLabel('Password').fill(fixture.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'QR Studio' })).toBeVisible();
};

// On narrow viewports the nav lives inside an off-canvas sidebar that starts
// closed; on wide viewports it's a persistent header row and this toggle is
// hidden entirely. Opening it only when present lets the same test body
// exercise both the desktop and mobile nav.
const navigateTo = async (page: Page, name: string) => {
  const sidebarToggle = page.getByRole('button', { name: 'Open menu' });
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
  }
  await page.getByRole('button', { name, exact: true }).click();
};

// These all sign in as the same seeded admin against the same backend
// session; running them in parallel workers raced navigation/socket state
// against each other and produced flaky failures unrelated to accessibility.
test.describe.configure({ mode: 'serial' });

test.describe('Restaurant admin accessibility', () => {
  test('QR Studio has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('Digital Menu has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Digital Menu');
    // The screen's own heading duplicates AdminPanel's "Admin Panel" copy
    // (a pre-existing content bug, out of scope for this a11y pass), so
    // confirm the screen loaded via seeded content instead. Scoped to the
    // <p> category label specifically: the same text also appears in a
    // hidden <option> inside a category-assignment <select>.
    await expect(page.locator('p', { hasText: 'Real E2E Category' })).toBeVisible();

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('Orders has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Orders');
    await expect(page.getByRole('heading', { name: 'Order Management' })).toBeVisible();

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('Tables has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Tables');
    await expect(page.getByRole('heading', { name: 'Table Management' })).toBeVisible();

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('Team has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Team');
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page.getByRole('main').getByText(fixture.email)).toBeVisible();

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('Team member add and status dialogs have no violations', async ({ page }, testInfo) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Team');
    await expect(page.getByRole('main').getByText(fixture.email)).toBeVisible();

    // The chromium and mobile-chrome projects share one backend/database
    // (see globalSetup.js), so a hardcoded email here would 409-conflict
    // between projects; scope it to the running project instead.
    const memberName = `A11y Team Member ${testInfo.project.name}`;
    const memberEmail = `a11y-team-member-${testInfo.project.name}@example.com`;

    // The seeded admin is its own row's OWNER, and self-suspension is
    // blocked, so a second member is added here to reach the suspend-confirm
    // dialog on a row that actually offers it.
    await page.getByRole('button', { name: 'Add member' }).click();
    const addDialog = page.getByRole('dialog');
    await expect(addDialog).toBeVisible();
    await freezeAnimations(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await addDialog.getByLabel('Email').fill(memberEmail);
    await addDialog.getByLabel('Name').fill(memberName);
    await addDialog.getByLabel('Password').fill('A11y-Team-Member-1!');
    await addDialog.getByRole('button', { name: 'Add member' }).click();
    await expect(addDialog).not.toBeVisible();
    await expect(page.getByText(memberName)).toBeVisible();

    await page.getByLabel(`Change status for ${memberName}`).selectOption('SUSPENDED');
    const suspendDialog = page.getByRole('dialog');
    await expect(suspendDialog).toBeVisible();
    await freezeAnimations(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await suspendDialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Analytics has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Analytics');
    // Every admin screen is a React.lazy() chunk under one Suspense boundary
    // that wraps the whole app shell, so scanning right after the click can
    // catch the app-wide loading fallback (no <main>, no <h1>) instead of
    // the real screen. Waiting for the screen's own heading sidesteps that.
    await expect(page.getByRole('heading', { name: 'Analytics dashboard' })).toBeVisible();

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('Admin panel has no violations', async ({ page }) => {
    const fixture = await readFixture();
    await signIn(page, fixture);
    await navigateTo(page, 'Admin');
    // AdminPanel's own heading reuses the "admin.title" key, which actually
    // renders "Admin Panel" (the same pre-existing content bug noted on the
    // Digital Menu screen above), not the "Restaurant Settings" fallback its
    // own `|| "Restaurant Settings"` suggests.
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

    await freezeAnimations(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
