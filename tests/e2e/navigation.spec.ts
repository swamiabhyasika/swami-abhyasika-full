import { expect, test } from '@playwright/test';
import { signIn, waitForLegacyApp } from './helpers';

// sidebar label → address, in the order of the original sidebar
const PAGES: [string, string, string][] = [
  ['Dashboard', '/dashboard', 'dashboard'],
  ['Students', '/students', 'admissions'],
  ['Basement Library', '/library/basement', 'basement'],
  ['2nd Floor Library', '/library/second-floor', 'floor2'],
  ['Fee Management', '/finance/fees', 'fees'],
  ['Reminders', '/finance/reminders', 'reminders'],
  ['Settings', '/settings', 'settings'],
  ['Statistics', '/finance/statistics', 'statistics'],
  ['Export Data', '/export', 'export'],
];

test.describe('every sidebar item has its own address', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await waitForLegacyApp(page);
  });

  test('clicking each item changes the address and shows that page', async ({ page }) => {
    for (const [label, href, id] of PAGES) {
      await page.locator('.nav-item', { hasText: label }).first().click();
      await expect(page).toHaveURL(new RegExp(href.replace(/\//g, '\\/') + '$'));
      await expect(page.locator(`#page-${id}`)).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(label.replace('Management', '')));
    }
  });

  test('New Admission opens the form at /students/new', async ({ page }) => {
    await page.locator('.nav-item', { hasText: 'New Admission' }).click();
    await expect(page).toHaveURL(/\/students\/new$/);
    await expect(page.locator('#page-admission-form')).toBeVisible();
  });

  test('the back and forward buttons move between pages', async ({ page }) => {
    await page.locator('.nav-item', { hasText: 'Students' }).first().click();
    await page.locator('.nav-item', { hasText: 'Basement Library' }).click();
    await expect(page.locator('#page-basement')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/students$/);
    await expect(page.locator('#page-admissions')).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/library\/basement$/);
    await expect(page.locator('#page-basement')).toBeVisible();
  });

  test('typing an address directly (a bookmark) opens that exact page', async ({ page }) => {
    for (const [, href, id] of PAGES.filter(([, h]) => h !== '/settings')) {
      await page.goto(href);
      await waitForLegacyApp(page);
      await expect(page.locator(`#page-${id}`)).toBeVisible();
      await expect(page.locator('.nav-item.active')).toHaveCount(1);
    }
  });

  test('capital letters in the address are corrected', async ({ page }) => {
    await page.goto('/Library/Basement');
    await expect(page).toHaveURL(/\/library\/basement$/);
  });

  test('an unknown address gives a "not found" page', async ({ page }) => {
    const res = await page.goto('/no-such-page');
    expect(res?.status()).toBe(404);
  });

  test('the old address /index.html still works', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
