import { expect, test } from '@playwright/test';
import { gotoReady, signIn, waitForLegacyApp } from './helpers';

const STEM = (n: string) => new RegExp(n);

test.describe('WhatsApp message templates (Settings)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await waitForLegacyApp(page);
  });

  test('Settings links to the new page, and the page shows all four messages', async ({ page }) => {
    await page.locator('.nav-item', { hasText: 'Settings' }).click();
    await page.getByRole('link', { name: 'Edit Templates' }).click();
    await expect(page).toHaveURL(/\/settings\/whatsapp$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'WhatsApp Message Templates' })).toBeVisible();
    for (const title of ['Seat confirmed', 'Fee receipt', 'Admission confirmed', 'Membership / fee reminder']) {
      await expect(page.getByRole('heading', { name: STEM(title) })).toBeVisible();
    }
    await expect(page.getByText('Original wording', { exact: true })).toHaveCount(4);
  });

  test('editing shows a live preview, saving keeps it, and resetting brings the original back', async ({ page }) => {
    await gotoReady(page, '/settings/whatsapp');
    const card = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Membership / fee reminder') }) });
    const box = card.getByLabel('Message text');

    await box.fill('Hello {name}, your fees are due. {status}');
    await expect(card.getByLabel('Message preview')).toContainText('Hello Asha Patil, your fees are due. ⏳ Your membership is expiring in 3 days.');
    await expect(card.getByText('Unsaved changes', { exact: true })).toBeVisible();

    await card.getByRole('button', { name: 'Save changes' }).click();
    await expect(card.getByRole('status')).toContainText('Saved');
    await expect(card.getByText('Customised', { exact: true })).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Membership / fee reminder') }) }).getByLabel('Message text')).toHaveValue('Hello {name}, your fees are due. {status}');

    page.once('dialog', (d) => d.accept());
    await page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Membership / fee reminder') }) }).getByRole('button', { name: 'Reset to original wording' }).click();
    await expect(page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Membership / fee reminder') }) }).getByLabel('Message text')).toHaveValue(/Namaste \*\{name\}\*!/);
  });

  test('a placeholder button inserts it where the cursor is', async ({ page }) => {
    await gotoReady(page, '/settings/whatsapp');
    const card = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Fee receipt') }) });
    const box = card.getByLabel('Message text');
    await box.fill('Paid: ');
    await box.focus();
    await box.press('End');
    await card.getByRole('button', { name: '{amount}', exact: true }).click();
    await expect(box).toHaveValue('Paid: {amount}');
  });

  test('empty text and unknown placeholders are caught before saving', async ({ page }) => {
    await gotoReady(page, '/settings/whatsapp');
    const card = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Fee receipt') }) });
    await card.getByLabel('Message text').fill('   ');
    await expect(card.getByText('The message cannot be empty.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await card.getByLabel('Message text').fill('Hi {name} {nmae}');
    await expect(card.getByText(/Unknown placeholder/)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  test('the wording saved in Settings is what the original screens actually send', async ({ page }) => {
    await gotoReady(page, '/settings/whatsapp');
    const card = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Fee receipt') }) });
    await card.getByLabel('Message text').fill('RECEIPT for {name}: ₹{amount} on {paymentDate}');
    await card.getByRole('button', { name: 'Save changes' }).click();
    await expect(card.getByRole('status')).toContainText('Saved');

    await page.goto('/finance/fees');
    await waitForLegacyApp(page);
    const message = await page.evaluate(() => (window as any).waMessage('fee_receipt', { name: 'Ravi', amount: '600', paymentDate: '2026-10-01' }));
    expect(message).toBe('RECEIPT for Ravi: ₹600 on 2026-10-01');
  });

  test('the reminder button sends the saved wording to WhatsApp', async ({ page }) => {
    await gotoReady(page, '/settings/whatsapp');
    const card = page.locator('[data-slot=card]', { has: page.getByRole('heading', { name: STEM('Membership / fee reminder') }) });
    await card.getByLabel('Message text').fill('REMINDER {name}|{period}|{status}{feeNote}');
    await card.getByRole('button', { name: 'Save changes' }).click();
    await expect(card.getByRole('status')).toContainText('Saved');

    await page.goto('/finance/reminders');
    await waitForLegacyApp(page);
    // Press the real "send reminder" function (phone, name, from, due, pending fees, days left) and capture the WhatsApp address.
    const url = await page.evaluate(() => {
      let opened = '';
      window.open = (u?: string | URL) => { opened = String(u); return null; };
      const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      sendReminderWA('9876543210', 'Ravi', '2026-10-01', due, 0, 3);
      return opened;
    });
    expect(url).toContain('https://wa.me/919876543210?text=');
    expect(decodeURIComponent(url)).toMatch(/text=REMINDER Ravi\|🗓 Subscription Period: \*2026-10-01\* → \*\d{4}-\d{2}-\d{2}\*\|⏳ Your membership is expiring in \*3 days\*\.\n✅ Your fees are up to date\.$/);
  });
});
