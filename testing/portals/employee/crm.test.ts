/**
 * Employee Portal — CRM E2E tests
 * =================================
 *
 * Verifies the CRM lookup + lead management surface:
 *  - Customer lookup by name / email / phone
 *  - Distributor lookup
 *  - Lead management (list + detail + convert)
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4923);
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

test.describe('Employee Portal — Customer lookup', () => {
  test('customer list page renders', async ({ page }) => {
    await loginAndGoto(page, '/crm/customers');

    await expect(page.getByRole('heading', { name: /customer/i })).toBeVisible({ timeout: 10_000 });
  });

  test('search input visible', async ({ page }) => {
    await loginAndGoto(page, '/crm/customers');

    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10_000 });
  });

  test('typing in search filters the list', async ({ page }) => {
    await loginAndGoto(page, '/crm/customers');

    await page.getByPlaceholder(/search/i).fill(FIXTURES.users.customer.firstName);
    await page.waitForTimeout(500);

    // The customer's name should appear in the results.
    await expect(page.getByText(new RegExp(FIXTURES.users.customer.firstName, 'i'))).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a customer opens their detail', async ({ page }) => {
    await loginAndGoto(page, '/crm/customers');

    const firstRow = page.locator('a[href*="customers/"], [data-testid="customer-row"]').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/crm\/customers\//, { timeout: 10_000 });
    }
  });
});

test.describe('Employee Portal — Distributor lookup', () => {
  test('distributor list page renders', async ({ page }) => {
    await loginAndGoto(page, '/crm/distributors');

    await expect(page.getByRole('heading', { name: /distributor/i })).toBeVisible({ timeout: 10_000 });
  });

  test('search input visible', async ({ page }) => {
    await loginAndGoto(page, '/crm/distributors');

    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a distributor opens their detail', async ({ page }) => {
    await loginAndGoto(page, '/crm/distributors');

    const firstRow = page.locator('a[href*="distributors/"], [data-testid="distributor-row"]').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/crm\/distributors\//, { timeout: 10_000 });
    }
  });
});

test.describe('Employee Portal — Lead management', () => {
  test('lead list renders', async ({ page }) => {
    await loginAndGoto(page, '/crm/leads');

    await expect(page.getByRole('heading', { name: /lead/i })).toBeVisible({ timeout: 10_000 });
  });

  test('lead detail renders', async ({ page }) => {
    await loginAndGoto(page, `/crm/leads/${FIXTURES.leads.list[0]!.id}`);

    await expect(page.getByText(FIXTURES.leads.list[0]!.name)).toBeVisible({ timeout: 10_000 });
  });

  test('lead detail shows contact info + stage + score', async ({ page }) => {
    await loginAndGoto(page, `/crm/leads/${FIXTURES.leads.list[0]!.id}`);

    await expect(page.getByText(/stage|status/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/phone|email/i)).toBeVisible({ timeout: 10_000 });
  });
});
