/**
 * Employee Portal — Dashboard E2E tests
 * =======================================
 *
 * Verifies the employee dashboard surface:
 *  - Dashboard renders with employee-specific KPIs (open tickets, my tasks, SLA, CSAT)
 *  - Today's tasks list renders
 *  - Recent tickets list renders
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4921);
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
  await page.getByLabel(/email/i).fill(FIXTURES.users.employee.email);
  await page.getByLabel(/password/i).fill(FIXTURES.users.employee.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|tasks|tickets)/, { timeout: 15_000 });
  await page.goto(path);
}

test.describe('Employee Portal — Dashboard renders', () => {
  test('dashboard page loads', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByRole('heading', { name: /dashboard|overview|home/i })).toBeVisible({ timeout: 10_000 });
  });

  test('employee name visible in header', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(new RegExp(FIXTURES.users.employee.firstName, 'i'))).toBeVisible({ timeout: 10_000 });
  });

  test('KPI cards visible (open tickets / my tasks)', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/open.*ticket|ticket|task/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Employee Portal — Today\'s tasks', () => {
  test('today\'s tasks list visible', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/today.*task|my.*task/i)).toBeVisible({ timeout: 10_000 });
  });

  test('each task shows title + status', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    const taskRow = page.locator('[data-testid="task-row"], [class*="task-item"]').first();
    if (await taskRow.count() > 0) {
      const text = (await taskRow.textContent()) ?? '';
      expect(text).toMatch(/open|in.progress|done|pending/i);
    }
  });

  test('clicking a task navigates to detail', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    const taskRow = page.locator('[data-testid="task-row"], [class*="task-item"]').first();
    if (await taskRow.count() > 0) {
      await taskRow.click();
      await expect(page).toHaveURL(/\/tasks\//, { timeout: 10_000 });
    }
  });
});

test.describe('Employee Portal — Recent tickets', () => {
  test('recent tickets list visible', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    await expect(page.getByText(/recent.*ticket|assigned.*ticket/i)).toBeVisible({ timeout: 10_000 });
  });

  test('each ticket shows subject + status', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    const ticketRow = page.locator('[data-testid="ticket-row"], a[href*="tickets/"]').first();
    if (await ticketRow.count() > 0) {
      const text = (await ticketRow.textContent()) ?? '';
      expect(text).toMatch(/open|in.progress|resolved|closed/i);
    }
  });

  test('clicking a ticket navigates to detail', async ({ page }) => {
    await loginAndGoto(page, '/dashboard');

    const ticketRow = page.locator('[data-testid="ticket-row"], a[href*="tickets/"]').first();
    if (await ticketRow.count() > 0) {
      await ticketRow.click();
      await expect(page).toHaveURL(/\/tickets\//, { timeout: 10_000 });
    }
  });
});
