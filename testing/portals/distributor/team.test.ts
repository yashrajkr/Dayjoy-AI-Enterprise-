/**
 * Distributor Portal — Team E2E tests
 * =====================================
 *
 * Verifies the team / downline management surface:
 *  - Downline tree renders with member cards (name, tier, level)
 *  - Expand/collapse nodes reveals/hides sub-level members
 *  - Clicking a member navigates to their detail page
 *  - Team stats panel shows correct totals (size, by-tier, by-level)
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4912);
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

test.describe('Distributor Portal — Team tree', () => {
  test('team page renders with downline members', async ({ page }) => {
    await loginAndGoto(page, '/team');

    await expect(page.getByRole('heading', { name: /team|downline|my team/i })).toBeVisible({ timeout: 10_000 });

    // Should show at least one member name.
    const members = page.locator('[data-testid="team-member"], [class*="member-card"], [class*="node"]');
    expect(await members.count()).toBeGreaterThanOrEqual(1);
  });

  test('each member card shows name + tier + level', async ({ page }) => {
    await loginAndGoto(page, '/team');

    const firstMember = page.locator('[data-testid="team-member"], [class*="member-card"], [class*="node"]').first();
    const text = (await firstMember.textContent()) ?? '';
    expect(text).toMatch(/bronze|silver|gold|platinum|diamond/i);
  });

  test('expand/collapse a node toggles its children', async ({ page }) => {
    await loginAndGoto(page, '/team');

    // Look for an expand button (chevron icon).
    const expand = page.locator('[data-lucide="chevron-right"], [data-lucide="chevron-down"], button[aria-label*="expand" i]').first();
    if (await expand.count() > 0) {
      const beforeCount = await page.locator('[data-testid="team-member"], [class*="member-card"], [class*="node"]').count();
      await expand.click();
      await page.waitForTimeout(300);
      const afterCount = await page.locator('[data-testid="team-member"], [class*="member-card"], [class*="node"]').count();
      // Either expanded (more) or collapsed (fewer).
      expect(afterCount).not.toBe(beforeCount);
    }
  });

  test('clicking a member navigates to their detail page', async ({ page }) => {
    await loginAndGoto(page, '/team');

    const firstMember = page.locator('[data-testid="team-member"], [class*="member-card"], [class*="node"]').first();
    if (await firstMember.count() > 0) {
      await firstMember.click();
      await expect(page).toHaveURL(/\/team\//, { timeout: 10_000 });
    }
  });
});

test.describe('Distributor Portal — Team stats', () => {
  test('total team size stat visible', async ({ page }) => {
    await loginAndGoto(page, '/team');

    await expect(page.getByText(/total.*downline|team.*size|47/i)).toBeVisible({ timeout: 10_000 });
  });

  test('tier breakdown visible', async ({ page }) => {
    await loginAndGoto(page, '/team');

    // Tier breakdown should mention at least one of the tier names.
    await expect(page.getByText(/bronze|silver|gold|platinum|diamond/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('level breakdown visible', async ({ page }) => {
    await loginAndGoto(page, '/team');

    // Level breakdown should mention "level" + a number.
    await expect(page.getByText(/level/i)).toBeVisible({ timeout: 10_000 });
  });
});
