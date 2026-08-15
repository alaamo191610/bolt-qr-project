import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Restaurant admin sign-in/sign-up form', () => {
  test('renders an accessible sign-in form', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('renders an accessible sign-up form', async ({ page }) => {
    await page.goto('/');
    await page.getByText("Don't have an account? Sign up").click();

    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
