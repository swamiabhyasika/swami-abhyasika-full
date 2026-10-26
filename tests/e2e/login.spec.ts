import { expect, test } from '@playwright/test';
import { ADMIN, signIn, stubOutsideLibraries, waitForLegacyApp } from './helpers';

test.describe('signing in and out', () => {
  test('a signed-out visitor is sent to the login page from any address', async ({ page }) => {
    for (const path of ['/dashboard', '/students', '/library/basement', '/settings', '/settings/whatsapp', '/settings/backup']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('a wrong password shows a clear message and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(ADMIN.username);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('#err')).toHaveText('Invalid username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the right password opens the dashboard; signing out returns to the login page and locks the app again', async ({ page }) => {
    await signIn(page);
    await waitForLegacyApp(page);
    await expect(page).toHaveTitle(/Dashboard/);
    await page.getByRole('link', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await stubOutsideLibraries(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the bare address "/" leads to the dashboard', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
