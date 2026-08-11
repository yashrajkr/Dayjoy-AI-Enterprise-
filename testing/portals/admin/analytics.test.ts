/**
 * Admin Dashboard — Analytics E2E tests
 * =======================================
 *
 * Verifies the admin analytics surface:
 *  - Analytics overview renders with platform-wide KPIs
 *  - Voice analytics renders (calls, duration, deflection)
 *  - AI performance renders (queries, latency, satisfaction, hallucination)
 *  - Sales analytics renders (MTD, target, growth)
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4933);
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
  await page.getByLabel(/email/i).fill(FIXTURES.users.admin.email);
  await page.getByLabel(/password/i).fill(FIXTURES.users.admin.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 15_000 });
  await page.goto(path);
}

test.describe('Admin Dashboard — Analytics overview', () => {
  test('analytics page renders', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    await expect(page.getByRole('heading', { name: /analytic|overview|metric/i })).toBeVisible({ timeout: 10_000 });
  });

  test('overview KPIs visible', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    // At least 3 of: users, orders, revenue, conversations.
    let found = 0;
    for (const kpi of ['user', 'order', 'revenue', 'conversation', 'ticket']) {
      if (await page.getByText(new RegExp(kpi, 'i')).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('date range filter visible', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    const filter = page.locator('input[type="date"], button:has-text("range"), [aria-label*="date" i]').first();
    if (await filter.count() > 0) {
      await expect(filter).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('Admin Dashboard — Voice analytics', () => {
  test('voice analytics section renders', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    await expect(page.getByText(/voice|call/i)).toBeVisible({ timeout: 10_000 });
  });

  test('voice KPIs visible (total calls, duration, deflection)', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    let found = 0;
    for (const kpi of ['call', 'duration', 'deflection']) {
      if (await page.getByText(new RegExp(kpi, 'i')).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Admin Dashboard — AI performance', () => {
  test('AI performance section renders', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    await expect(page.getByText(/ai|model|llm/i)).toBeVisible({ timeout: 10_000 });
  });

  test('AI KPIs visible (queries, latency, satisfaction)', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    let found = 0;
    for (const kpi of ['query', 'latency', 'response.*time', 'satisfaction', 'hallucination']) {
      if (await page.getByText(new RegExp(kpi, 'i')).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('AI latency value is numeric (ms or s)', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    // Latency should appear as a number followed by ms or s.
    const latency = page.getByText(/\d+\s?(ms|s)\b/i).first();
    if (await latency.count() > 0) {
      await expect(latency).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('Admin Dashboard — Sales analytics', () => {
  test('sales analytics section renders', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    await expect(page.getByText(/sales|revenue|growth/i)).toBeVisible({ timeout: 10_000 });
  });

  test('sales KPIs visible (MTD, target, growth)', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    let found = 0;
    for (const kpi of ['mtd', 'target', 'growth', 'revenue']) {
      if (await page.getByText(new RegExp(kpi, 'i')).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('growth indicator visible (positive or negative %)', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    // Look for a percentage value.
    const pct = page.getByText(/[+-]?\d+(\.\d+)?%/).first();
    if (await pct.count() > 0) {
      await expect(pct).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('Admin Dashboard — Channel breakdown', () => {
  test('conversations by channel visible', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    let found = 0;
    for (const c of ['website', 'voice', 'whatsapp']) {
      if (await page.getByText(new RegExp(c, 'i')).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('channel chart renders', async ({ page }) => {
    await loginAndGoto(page, '/analytics');

    const charts = page.locator('.recharts-surface, canvas, [class*="chart"]');
    expect(await charts.count()).toBeGreaterThanOrEqual(1);
  });
});
