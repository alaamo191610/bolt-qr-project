import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('SuperAdmin login', () => {
  test('renders an accessible login form on desktop and mobile', async ({ page }) => {
    await page.goto('/super-admin/login');

    await expect(page.getByRole('heading', { name: 'Super Admin' })).toBeVisible();
    await expect(page.getByPlaceholder('admin@yourrestaurant.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
