import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoReady, signIn, waitForLegacyApp } from './helpers';

test.describe('Backup & Restore (Settings)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await waitForLegacyApp(page);
  });

  test('Settings links to the Backup page', async ({ page }) => {
    await page.locator('.nav-item', { hasText: 'Settings' }).click();
    await page.getByRole('link', { name: 'Open Backups' }).click();
    await expect(page).toHaveURL(/\/settings\/backup$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Backup & Restore', level: 1 })).toBeVisible();
  });

  test('shows device and Google Drive separately, with the schedule', async ({ page }) => {
    await gotoReady(page, '/settings/backup');
    await expect(page.getByRole('heading', { name: 'On this device' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Google Drive' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Automatic daily backup' })).toBeVisible();
    await expect(page.getByText('Next scheduled run')).toBeVisible();
    await expect(page.getByText(/2:00 am/i).first()).toBeVisible();
    await expect(page.getByText('Not connected').first()).toBeVisible();
    await expect(page.getByText('Google Drive is not set up on the server yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect Google Drive' })).toBeDisabled();
  });

  test('downloading a backup saves a complete file and adds it to the history', async ({ page }) => {
    // some data first, so the backup has something in it (through the original screen's own save function)
    await page.goto('/students');
    await waitForLegacyApp(page);
    await page.evaluate(() => {
      students.push({ id: 'STU-B1', name: 'Backup Student', phone: '9000000001', gender: 'Male', totalFees: 600, paidFees: 600, payments: [{ id: 'P1', amount: 600, date: '2026-10-01', method: 'Cash' }] });
      save();
    });
    await page.waitForTimeout(1500); // let the save reach the server

    await gotoReady(page, '/settings/backup');
    await expect(page.getByText('No backup yet').first()).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup now' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^swami-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/);
    const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(file.app).toBe('swami-abhyasika');
    expect(file.counts.students).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(file.data.edu_students).some((s: any) => s.name === 'Backup Student')).toBe(true);
    expect(file.data.edu_owner_delete_pin).toBeUndefined();

    await expect(page.getByRole('status')).toContainText('Backup downloaded');
    const deviceCard = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: 'On this device' }) });
    await expect(deviceCard.getByText('Manual (you clicked a button)')).toBeVisible();
    await expect(deviceCard.getByText('First backup')).toBeVisible();
    const history = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: 'Backup history' }) });
    await expect(history.getByRole('row', { name: /This device.*Manual.*success/ })).toBeVisible();
    // the Google Drive side is untouched
    const driveCard = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: 'Google Drive' }) });
    await expect(driveCard.getByText('No backup yet').first()).toBeVisible();
  });

  test('after more changes, the page says what is not yet backed up, and the next backup counts them', async ({ page }) => {
    await page.goto('/students');
    await waitForLegacyApp(page);
    await page.evaluate(() => {
      students.push({ id: 'STU-B2', name: 'Second Student', phone: '9000000002', gender: 'Female', totalFees: 500, paidFees: 0, payments: [] });
      save();
    });
    await page.waitForTimeout(1500);
    await gotoReady(page, '/settings/backup');
    const deviceCard = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: 'On this device' }) });
    await expect(deviceCard.getByText('1 change')).toBeVisible();
    await expect(deviceCard.getByText('1 student added')).toBeVisible();
    await page.getByRole('button', { name: 'Download backup now' }).click();
    await expect(deviceCard.getByText('Up to date')).toBeVisible();
    await expect(deviceCard.getByText('1 student added').first()).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the menu is hidden until opened', async ({ page }) => {
    await signIn(page);
    await gotoReady(page, '/settings/whatsapp');
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' }).or(page.locator('#main-sidebar'));
    await expect(page.locator('#main-sidebar')).not.toBeInViewport();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('#main-sidebar')).toBeInViewport();
    await expect(sidebar.first()).toBeVisible();
    await page.getByRole('link', { name: 'Students' }).click();
    await expect(page).toHaveURL(/\/students$/);
  });
});
