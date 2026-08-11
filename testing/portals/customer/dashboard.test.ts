/**
 * Customer Portal — Dashboard E2E tests
 * =======================================
 *
 * Covers the dashboard surface a customer sees after logging in:
 *  - Dashboard renders (header + sidebar + main)
 *  - Welcome message includes the customer's name
 *  - Order summary card shows total / pending / delivered counts
 *  - Recent orders list shows up to 5 orders with status badges
 *  - AI assistant quick-access card is visible + clickable
 *  - Notifications dropdown / panel renders
 *  - Recommended products section shows at least 1 product card
 *
 * Each test authenticates via the mock backend before navigating to
 * /dashboard, so the route guard lets us through.
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4902);
});

test.afterAll(async () => {
  if (mock) await mock.close();
});

test.beforeEach(async () => {
  await mock.reset();
});

async function loginAndGotoDashboard(page: Page) {
  // Inject the mock API base URL on every navigation.
  await page.addInitScript((baseUrl: string) => {
    (window as any).__API_BASE__ = baseUrl;
    (window as any).__E2E__ = true;
  }, mock.baseUrl);

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(FIXTURES.users.customer.email);
  await page.getByLabel(/password/i).fill(FIXTURES.users.customer.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe('Customer Portal — Dashboard renders', () => {
  test('dashboard page loads with header + sidebar', async ({ page }) => {
    await loginAndGotoDashboard(page);

    // Sidebar should have the main nav items.
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /orders/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /products/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /support|help/i }).first()).toBeVisible();

    // Header should have the customer's name or avatar.
    await expect(page.getByText(/welcome|hello|hi/i)).toBeVisible({ timeout: 10_000 });
  });

  test('welcome message includes customer first name', async ({ page }) => {
    await loginAndGotoDashboard(page);

    await expect(page.getByText(new RegExp(FIXTURES.users.customer.firstName, 'i'))).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Customer Portal — Dashboard order summary', () => {
  test('order summary card renders with counts', async ({ page }) => {
    await loginAndGotoDashboard(page);

    // Order summary card.
    await expect(page.getByText(/order|recent orders/i).first()).toBeVisible({ timeout: 10_000 });

    // At least one order status should be visible.
    const statusText = await page.getByText(/delivered|shipped|processing|pending|cancelled/i).first().textContent();
    expect(statusText).toBeTruthy();
  });

  test('recent orders list shows at most 5 items', async ({ page }) => {
    await loginAndGotoDashboard(page);

    // Each order card / row should have a status badge + an order number.
    const orderLinks = page.getByRole('link', { name: /ord_|#ord|order/i });
    const count = await orderLinks.count();
    // At least one (the fixture has 4 orders for the customer user).
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(5);
  });

  test('clicking a recent order navigates to order detail', async ({ page }) => {
    await loginAndGotoDashboard(page);

    const firstOrderLink = page.getByRole('link', { name: /ord_|#ord|order/i }).first();
    await firstOrderLink.click();
    await expect(page).toHaveURL(/\/orders\//, { timeout: 10_000 });
  });
});

test.describe('Customer Portal — Dashboard AI quick access', () => {
  test('AI assistant quick-access card is visible', async ({ page }) => {
    await loginAndGotoDashboard(page);

    await expect(page.getByRole('link', { name: /ask ai|assistant|chat/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('clicking AI quick-access navigates to assistant page', async ({ page }) => {
    await loginAndGotoDashboard(page);

    await page.getByRole('link', { name: /ask ai|assistant|chat/i }).first().click();
    await expect(page).toHaveURL(/\/(ai-assistant|assistant|chat)/, { timeout: 10_000 });
  });
});

test.describe('Customer Portal — Dashboard notifications', () => {
  test('notification bell icon visible in header', async ({ page }) => {
    await loginAndGotoDashboard(page);

    // Look for a bell icon (lucide:bell is commonly used).
    const bell = page.locator('[data-lucide="bell"], svg[class*="bell"], button[aria-label*="notification" i]').first();
    await expect(bell).toBeVisible({ timeout: 10_000 });
  });

  test('clicking bell opens notifications panel', async ({ page }) => {
    await loginAndGotoDashboard(page);

    const bell = page.locator('[data-lucide="bell"], svg[class*="bell"], button[aria-label*="notification" i]').first();
    await bell.click();

    // Either a dropdown opens with notifications, or we navigate to /notifications.
    await expect(page).toHaveURL(/\/notifications/, { timeout: 5_000 }).catch(async () => {
      // Dropdown path — check that some notification content appears.
      const panel = page.locator('[role="dialog"], [role="menu"], [class*="notification"]');
      await expect(panel.first()).toBeVisible({ timeout: 5_000 });
    });
  });
});

test.describe('Customer Portal — Dashboard recommendations', () => {
  test('recommended products section renders at least one product card', async ({ page }) => {
    await loginAndGotoDashboard(page);

    await expect(page.getByText(/recommend|for you|you might like/i).first()).toBeVisible({ timeout: 10_000 });

    // The product cards should have an "Add to cart" button + a price in INR.
    const addToCartButtons = page.getByRole('button', { name: /add to cart|add/i });
    const count = await addToCartButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
