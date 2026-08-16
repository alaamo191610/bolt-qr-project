import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Invite-only restaurant admin sign-in form', () => {
  test('renders an accessible sign-in form', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('does not expose public restaurant signup', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText(/invitation-only/iu)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up/iu })).toHaveCount(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
