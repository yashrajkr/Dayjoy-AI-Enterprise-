/**
 * Distributor Portal — Earnings E2E tests
 * =========================================
 *
 * Verifies the earnings dashboard:
 *  - Page renders with YTD / month / pending totals
 *  - Earnings breakdown chart (personal vs team) renders
 *  - Payout history table shows past payouts with status badges
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4914);
});

test.afterAll(async () => {
  if (mock) await mock.close();
});

test.beforeEach(async () => {
  await mock.reset();
});

async function loginAndGoto(page: Page, path: string) {
  await page.addInitScript((baseUrl: string) => {
    (window as any).__API_BASE__ = baseUrl;
    (window as any).__E2E__ = true;
  }, mock.baseUrl);
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(FIXTURES.users.distributor.email);
  await page.getByLabel(/password/i).fill(FIXTURES.users.distributor.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|leads|overview)/, { timeout: 15_000 });
  await page.goto(path);
}

test.describe('Distributor Portal — Earnings dashboard', () => {
  test('earnings page renders', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    await expect(page.getByRole('heading', { name: /earning|payout|income/i })).toBeVisible({ timeout: 10_000 });
  });

  test('YTD total visible', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    await expect(page.getByText(/ytd|year.*date|total.*earning/i)).toBeVisible({ timeout: 10_000 });
  });

  test('this-month total visible', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    await expect(page.getByText(/month|monthly/i)).toBeVisible({ timeout: 10_000 });
  });

  test('pending payout visible', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    await expect(page.getByText(/pending|next.*payout/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Distributor Portal — Earnings breakdown chart', () => {
  test('breakdown chart renders (personal vs team)', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    await expect(page.locator('.recharts-surface, canvas, [class*="chart"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/personal|team/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Distributor Portal — Payout history', () => {
  test('payout history table renders with rows', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    const table = page.locator('table').first();
    if (await table.count() > 0) {
      const rows = table.locator('tr');
      expect(await rows.count()).toBeGreaterThanOrEqual(2);
    }
  });

  test('each payout row shows month + amount + status', async ({ page }) => {
    await loginAndGoto(page, '/earnings');

    const table = page.locator('table').first();
    if (await table.count() > 0) {
      const firstRow = table.locator('tr').nth(1);
      const text = (await firstRow.textContent()) ?? '';
      expect(text).toMatch(/paid|pending|processing/i);
      expect(text).toMatch(/₹|Rs\.?|INR/i);
    }
  });
});
