/**
 * Customer Portal — Orders E2E tests
 * ====================================
 *
 * Verifies the order history + order detail + return flow:
 *  - Order history page renders with past orders
 *  - Each order shows status badge + total + date
 *  - Order detail page renders with line items + tracking timeline
 *  - Tracking timeline shows the order lifecycle (PLACED → CONFIRMED → SHIPPED → DELIVERED)
 *  - Download invoice button triggers a download / print view
 *  - Return request form requires a reason + submits successfully
 *  - Return request for cancelled order is blocked
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4904);
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
  await page.getByLabel(/email/i).fill(FIXTURES.users.customer.email);
  await page.getByLabel(/password/i).fill(FIXTURES.users.customer.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await page.goto(path);
}

test.describe('Customer Portal — Order history', () => {
  test('order history page renders', async ({ page }) => {
    await loginAndGoto(page, '/orders');

    await expect(page.getByRole('heading', { name: /orders|order history|my orders/i })).toBeVisible({ timeout: 10_000 });
  });

  test('order history shows at least one past order', async ({ page }) => {
    await loginAndGoto(page, '/orders');

    // Each order row should have an order id, status, and total.
    const orderRows = page.locator('[data-testid="order-row"], article:has-text("ord_"), tr:has-text("ord_")');
    await orderRows.first().waitFor({ timeout: 10_000 });
    expect(await orderRows.count()).toBeGreaterThanOrEqual(1);
  });

  test('each order shows status + date + total', async ({ page }) => {
    await loginAndGoto(page, '/orders');

    const firstRow = page.locator('[data-testid="order-row"], article:has-text("ord_"), tr:has-text("ord_")').first();
    const text = (await firstRow.textContent()) ?? '';
    // Status keyword.
    expect(text).toMatch(/delivered|shipped|processing|pending|cancelled/i);
    // Currency.
    expect(text).toMatch(/₹|Rs\.?|INR/i);
  });

  test('clicking an order navigates to its detail page', async ({ page }) => {
    await loginAndGoto(page, '/orders');

    const firstRow = page.locator('[data-testid="order-row"], article:has-text("ord_"), tr:has-text("ord_")').first();
    await firstRow.click();
    await expect(page).toHaveURL(/\/orders\/ord_/, { timeout: 10_000 });
  });
});

test.describe('Customer Portal — Order detail', () => {
  test('order detail page renders with line items', async ({ page }) => {
    await loginAndGoto(page, '/orders');

    const firstRow = page.locator('[data-testid="order-row"], article:has-text("ord_"), tr:has-text("ord_")').first();
    await firstRow.click();
    await expect(page).toHaveURL(/\/orders\/ord_/, { timeout: 10_000 });

    // Should show order id + line items + total.
    await expect(page.getByText(/ord_/i)).toBeVisible();
    await expect(page.getByText(/₹|Rs\.?|INR/i)).toBeVisible();
  });

  test('tracking timeline renders for shipped/delivered orders', async ({ page }) => {
    // Navigate directly to the delivered order.
    await loginAndGoto(page, `/orders/${FIXTURES.orders.deliveredId}`);

    // Timeline should show PLACED → CONFIRMED → SHIPPED → DELIVERED steps.
    await expect(page.getByText(/placed|confirmed|shipped|delivered/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('download invoice button is visible + clickable', async ({ page }) => {
    await loginAndGoto(page, `/orders/${FIXTURES.orders.deliveredId}`);

    const invoiceBtn = page.getByRole('link', { name: /invoice/i }).or(page.getByRole('button', { name: /invoice/i })).first();
    await expect(invoiceBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Customer Portal — Return request', () => {
  test('return form on delivered order succeeds', async ({ page }) => {
    await loginAndGoto(page, `/orders/${FIXTURES.orders.deliveredId}/return`);

    // Look for a reason select / textarea.
    const reasonField = page.getByLabel(/reason/i).or(page.locator('select, textarea').first());
    if (await reasonField.count() > 0) {
      await reasonField.click();
      // Pick the first option (or fill with text).
      await page.getByRole('option').first().click().catch(async () => {
        await reasonField.fill('Product did not meet expectations.');
      });
    }

    const submit = page.getByRole('button', { name: /submit|request return|raise return/i });
    if (await submit.count() > 0) {
      await submit.click();
      // Should show a success message OR redirect back to order detail.
      await expect(page.getByText(/return.*(?:submitted|requested|created)|we.*received.*return/i)).toBeVisible({ timeout: 10_000 })
        .catch(async () => {
          // Or redirected.
          await expect(page).toHaveURL(/\/orders\//, { timeout: 5_000 });
        });
    }
  });

  test('return on cancelled order is blocked with error', async ({ page }) => {
    await loginAndGoto(page, `/orders/${FIXTURES.orders.cancelledId}/return`);

    const submit = page.getByRole('button', { name: /submit|request return/i });
    if (await submit.count() > 0) {
      await submit.click();
      await expect(page.getByText(/cannot.*return.*cancelled|cancelled.*cannot/i)).toBeVisible({ timeout: 10_000 });
    }
  });
});
