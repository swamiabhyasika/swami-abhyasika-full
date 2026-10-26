import { expect, type Page } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'E2E-Password-1' };

/**
 * The original screens load three libraries (charts, PDF, Excel) from the internet. On a machine without
 * internet access (such as a build server) they are replaced with empty stand-ins so the pages can still start.
 * Set E2E_STUB_CDN=1 to turn this on.
 */
export async function stubOutsideLibraries(page: Page) {
  if (!process.env.E2E_STUB_CDN) return;
  await page.addInitScript(() => {
    const w = window as any;
    w.Chart = class { destroy() {} update() {} static register() {} };
    w.jspdf = { jsPDF: class {} };
    w.XLSX = { utils: {}, writeFile() {} };
  });
  await page.route(/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (route) =>
    route.fulfill({ status: 200, contentType: route.request().url().includes('.css') || route.request().url().includes('googleapis') ? 'text/css' : 'application/javascript', body: '' }),
  );
}

export async function signIn(page: Page, { username, password } = ADMIN) {
  await stubOutsideLibraries(page);
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard');
}

/** Waits until the original screen has loaded its data and started. */
export async function waitForLegacyApp(page: Page) {
  await page.waitForFunction(() => typeof (window as any).showPage === 'function' && typeof (window as any).waMessage === 'function');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible();
}

/** Opens a page built with React and waits until its scripts are running (typing earlier would be ignored). */
export async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}
