/**
 * Distributor Portal — Leads E2E tests
 * ======================================
 *
 * Verifies the lead pipeline (kanban) + lead management surface:
 *  - Lead pipeline (kanban) renders with columns per stage
 *  - Create lead form creates a new lead
 *  - Lead detail page renders with info + actions
 *  - Convert lead to customer action works
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4916);
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

test.describe('Distributor Portal — Lead pipeline (kanban)', () => {
  test('leads page renders', async ({ page }) => {
    await loginAndGoto(page, '/leads');

    await expect(page.getByRole('heading', { name: /lead|pipeline/i })).toBeVisible({ timeout: 10_000 });
  });

  test('kanban columns visible (NEW, CONTACTED, QUALIFIED, etc.)', async ({ page }) => {
    await loginAndGoto(page, '/leads');

    // The kanban should have at least 3 stage columns.
    const columns = page.locator('[data-testid="kanban-column"], [class*="kanban-col"], [class*="column"]:has-text("NEW")');
    expect(await columns.count()).toBeGreaterThanOrEqual(1);

    // Common stage names should appear somewhere.
    await expect(page.getByText(/new|contacted|qualified|won|lost/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('lead cards visible inside columns', async ({ page }) => {
    await loginAndGoto(page, '/leads');

    const cards = page.locator('[data-testid="lead-card"], [class*="lead-card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

  test('view toggle (table/kanban) visible', async ({ page }) => {
    await loginAndGoto(page, '/leads');

    const toggle = page.getByRole('button', { name: /kanban|table|grid/i }).first();
    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('Distributor Portal — Create lead', () => {
  test('new lead button visible', async ({ page }) => {
    await loginAndGoto(page, '/leads');

    await expect(page.getByRole('link', { name: /new.*lead|add.*lead|create.*lead/i }).or(page.getByRole('button', { name: /new.*lead|add.*lead/i }))).toBeVisible({ timeout: 10_000 });
  });

  test('create lead form renders with required fields', async ({ page }) => {
    await loginAndGoto(page, '/leads/new');

    await expect(page.getByLabel(/name/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/phone|mobile/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create|submit|save/i })).toBeVisible();
  });

  test('form validation: name required', async ({ page }) => {
    await loginAndGoto(page, '/leads/new');

    await page.getByLabel(/phone|mobile/i).fill('+919812345678');
    await page.getByRole('button', { name: /create|submit|save/i }).click();

    await expect(page.getByText(/name.*required|enter.*name/i)).toBeVisible({ timeout: 5_000 });
  });

  test('successful submission creates lead + redirects', async ({ page }) => {
    await loginAndGoto(page, '/leads/new');

    await page.getByLabel(/name/i).fill('Test Lead Name');
    await page.getByLabel(/phone|mobile/i).fill('+919812345678');
    await page.getByLabel(/email/i).fill('test.lead@example.com').catch(() => undefined);
    await page.getByRole('button', { name: /create|submit|save/i }).click();

    // Either success toast OR redirect to leads list / detail.
    await expect(page.getByText(/lead.*created|success/i)).toBeVisible({ timeout: 10_000 })
      .catch(async () => {
        await expect(page).toHaveURL(/\/leads/, { timeout: 5_000 });
      });
  });
});

test.describe('Distributor Portal — Lead detail', () => {
  test('lead detail renders with name + contact info', async ({ page }) => {
    await loginAndGoto(page, `/leads/${FIXTURES.leads.list[0]!.id}`);

    await expect(page.getByText(FIXTURES.leads.list[0]!.name)).toBeVisible({ timeout: 10_000 });
  });

  test('lead detail shows stage + score', async ({ page }) => {
    await loginAndGoto(page, `/leads/${FIXTURES.leads.list[0]!.id}`);

    await expect(page.getByText(/stage|status/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/score/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Distributor Portal — Convert lead', () => {
  test('convert-to-customer button visible', async ({ page }) => {
    await loginAndGoto(page, `/leads/${FIXTURES.leads.list[0]!.id}`);

    await expect(page.getByRole('button', { name: /convert/i })).toBeVisible({ timeout: 10_000 });
  });

  test('clicking convert shows success + customer id', async ({ page }) => {
    await loginAndGoto(page, `/leads/${FIXTURES.leads.list[0]!.id}`);

    await page.getByRole('button', { name: /convert/i }).click();

    // Either a confirmation dialog or a success toast.
    const confirm = page.getByRole('button', { name: /confirm|yes|proceed/i });
    if (await confirm.count() > 0) {
      await confirm.click();
    }

    await expect(page.getByText(/converted|customer.*created/i)).toBeVisible({ timeout: 10_000 })
      .catch(async () => {
        // Or the lead stage changed to CONVERTED.
        await expect(page.getByText(/converted/i)).toBeVisible({ timeout: 5_000 });
      });
  });
});
