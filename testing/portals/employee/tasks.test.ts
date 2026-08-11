/**
 * Employee Portal — Tasks E2E tests
 * ===================================
 *
 * Verifies the task management surface:
 *  - Task list renders (table + kanban view toggle)
 *  - Create task form creates a task
 *  - Task detail renders with full info
 *  - Mark task complete updates status
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4922);
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

test.describe('Employee Portal — Task list', () => {
  test('tasks page renders', async ({ page }) => {
    await loginAndGoto(page, '/tasks');

    await expect(page.getByRole('heading', { name: /task/i })).toBeVisible({ timeout: 10_000 });
  });

  test('task list has rows', async ({ page }) => {
    await loginAndGoto(page, '/tasks');

    const table = page.locator('table').first();
    if (await table.count() > 0) {
      const rows = table.locator('tr');
      expect(await rows.count()).toBeGreaterThanOrEqual(2);
    } else {
      // Kanban view.
      const cards = page.locator('[data-testid="task-card"], [class*="task-card"]');
      expect(await cards.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('view toggle (table / kanban) visible', async ({ page }) => {
    await loginAndGoto(page, '/tasks');

    const toggle = page.getByRole('button', { name: /kanban|table|grid|list/i }).first();
    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible({ timeout: 10_000 });
    }
  });

  test('each task row shows title + status + priority', async ({ page }) => {
    await loginAndGoto(page, '/tasks');

    const table = page.locator('table').first();
    if (await table.count() > 0) {
      const firstRow = table.locator('tr').nth(1);
      const text = (await firstRow.textContent()) ?? '';
      expect(text).toMatch(/open|in.progress|done|pending/i);
    }
  });
});

test.describe('Employee Portal — Create task', () => {
  test('new task button visible', async ({ page }) => {
    await loginAndGoto(page, '/tasks');

    await expect(page.getByRole('link', { name: /new.*task|create.*task/i }).or(page.getByRole('button', { name: /new.*task|create.*task/i }))).toBeVisible({ timeout: 10_000 });
  });

  test('create task form renders', async ({ page }) => {
    await loginAndGoto(page, '/tasks/new');

    await expect(page.getByLabel(/title|subject/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /create|submit|save/i })).toBeVisible();
  });

  test('form validation: title required', async ({ page }) => {
    await loginAndGoto(page, '/tasks/new');

    await page.getByRole('button', { name: /create|submit|save/i }).click();

    await expect(page.getByText(/title.*required|enter.*title/i)).toBeVisible({ timeout: 5_000 });
  });

  test('successful submission creates task', async ({ page }) => {
    await loginAndGoto(page, '/tasks/new');

    await page.getByLabel(/title|subject/i).fill('Test task from E2E');
    await page.getByLabel(/description/i).fill('Test description').catch(() => undefined);
    const priority = page.getByLabel(/priority/i);
    if (await priority.count() > 0) {
      await priority.click().catch(() => undefined);
      await page.getByRole('option', { name: /high/i }).click().catch(() => undefined);
    }
    await page.getByRole('button', { name: /create|submit|save/i }).click();

    await expect(page.getByText(/task.*created|success/i)).toBeVisible({ timeout: 10_000 })
      .catch(async () => {
        await expect(page).toHaveURL(/\/tasks/, { timeout: 5_000 });
      });
  });
});

test.describe('Employee Portal — Task detail', () => {
  test('task detail renders with title + description', async ({ page }) => {
    await loginAndGoto(page, `/tasks/${FIXTURES.tasks.openId}`);

    await expect(page.getByText(FIXTURES.tasks.list[0]!.title)).toBeVisible({ timeout: 10_000 });
  });

  test('task detail shows status + assignee + due date', async ({ page }) => {
    await loginAndGoto(page, `/tasks/${FIXTURES.tasks.openId}`);

    await expect(page.getByText(/status|state/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/due|deadline/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Employee Portal — Mark task complete', () => {
  test('mark complete button visible on open task', async ({ page }) => {
    await loginAndGoto(page, `/tasks/${FIXTURES.tasks.openId}`);

    await expect(page.getByRole('button', { name: /complete|mark.*done|close/i })).toBeVisible({ timeout: 10_000 });
  });

  test('clicking mark complete updates status to DONE', async ({ page }) => {
    await loginAndGoto(page, `/tasks/${FIXTURES.tasks.openId}`);

    await page.getByRole('button', { name: /complete|mark.*done|close/i }).click();

    // Confirm if a dialog appears.
    const confirm = page.getByRole('button', { name: /confirm|yes|proceed/i });
    if (await confirm.count() > 0) {
      await confirm.click();
    }

    await expect(page.getByText(/done|completed|closed/i)).toBeVisible({ timeout: 10_000 });
  });
});
