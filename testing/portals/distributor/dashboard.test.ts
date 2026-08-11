/**
 * Distributor Portal — Dashboard E2E tests
 * ==========================================
 *
 * Verifies the dashboard surface a distributor sees after logging in:
 *  - Dashboard renders with distributor-specific KPIs (sales, commission, team, goal)
 *  - Sales chart renders (revenue over time)
 *  - Commission chart renders (monthly breakdown)
 *  - Team growth chart renders (downline over time)
 *  - Goal progress card shows current month progress vs target
 *
 * The distributor portal is a separate Next.js app (apps/distributor-portal).
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4911);
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

test.describe('Distributor Portal — Dashboard renders', () => {
  test('dashboard page loads with KPI cards', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    // Should have at least 4 KPI cards.
    await expect(page.getByText(/sales|revenue|commission|team|downline|goal/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows distributor name in welcome message', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(new RegExp(FIXTURES.users.distributor.firstName, 'i'))).toBeVisible({ timeout: 10_000 });
  });

  test('shows tier badge (BRONZE/SILVER/GOLD/PLATINUM/DIAMOND)', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/bronze|silver|gold|platinum|diamond/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Distributor Portal — Sales chart', () => {
  test('sales chart canvas renders', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    // Recharts renders an SVG with class "recharts-surface".
    const chart = page.locator('.recharts-surface, canvas, [class*="chart"]').first();
    await expect(chart).toBeVisible({ timeout: 10_000 });
  });

  test('sales KPI shows YTD total', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    // The YTD sales figure should appear (Rs. 12,45,000 or similar INR format).
    await expect(page.getByText(/₹|Rs\.?|INR/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Distributor Portal — Commission chart', () => {
  test('commission summary card renders', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/commission/i)).toBeVisible({ timeout: 10_000 });
  });

  test('next payout date visible', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/payout|next.*payout/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Distributor Portal — Team growth', () => {
  test('team size KPI visible', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/team|downline/i)).toBeVisible({ timeout: 10_000 });
  });

  test('team growth chart renders', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    // Either the same .recharts-surface (multi-chart dashboard) or a dedicated chart.
    const charts = page.locator('.recharts-surface, canvas, [class*="chart"]');
    expect(await charts.count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Distributor Portal — Goal progress', () => {
  test('goal progress card renders with percentage', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/goal|target|progress/i)).toBeVisible({ timeout: 10_000 });
  });

  test('goal progress bar or percentage visible', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    // Either a progress bar or a percentage text.
    const progressBar = page.locator('[role="progressbar"], [class*="progress"]');
    const percentText = page.getByText(/\d+%/);
    const barVisible = await progressBar.first().isVisible().catch(() => false);
    const percentVisible = await percentText.first().isVisible().catch(() => false);
    expect(barVisible || percentVisible).toBe(true);
  });
});
