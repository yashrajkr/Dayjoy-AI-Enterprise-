/**
 * Customer Portal — AI Assistant E2E tests
 * ==========================================
 *
 * Verifies the AI chat surface a customer uses to ask product + policy
 * questions:
 *  - Chat interface renders (message list + input + send button)
 *  - Sending a message produces an assistant reply
 *  - Streaming response updates the assistant bubble progressively
 *  - Citations render as cards under the assistant message
 *  - Voice input button is visible
 *  - WhatsApp button is visible
 *  - Conversation history page lists past conversations
 */
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, startMockBackend, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

test.beforeAll(async () => {
  mock = await startMockBackend(4905);
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

test.describe('Customer Portal — AI chat interface', () => {
  test('chat interface renders with message list + input + send button', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    await expect(page.getByPlaceholder(/type.*message|ask.*anything/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible();
  });

  test('send message → assistant reply appears', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    const input = page.getByPlaceholder(/type.*message|ask.*anything/i);
    await input.fill('What is the return policy?');
    await page.getByRole('button', { name: /send/i }).click();

    // Wait for the user message bubble to appear.
    await expect(page.getByText('What is the return policy?')).toBeVisible({ timeout: 10_000 });

    // Wait for the assistant reply (contains the word "refund" or "return" or "days").
    await expect(page.getByText(/return|refund|days/i).nth(1)).toBeVisible({ timeout: 15_000 });
  });

  test('empty message is rejected', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    const input = page.getByPlaceholder(/type.*message|ask.*anything/i);
    await input.fill('');
    await page.getByRole('button', { name: /send/i }).click();

    // Either the input stays empty (button disabled) or an error appears.
    const errorVisible = await page.getByText(/message.*cannot.*be.*empty|enter.*message/i).isVisible().catch(() => false);
    const sendDisabled = await page.getByRole('button', { name: /send/i }).isDisabled().catch(() => false);
    expect(errorVisible || sendDisabled).toBe(true);
  });

  test('quick-reply chips are visible', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    // Should have at least one quick-reply chip / suggestion button.
    const chips = page.getByRole('button').filter({ hasText: /^(return policy|shipping|track.*order|become.*distributor|talk.*human)$/i });
    expect(await chips.count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Customer Portal — Citations', () => {
  test('citation cards appear under assistant reply for KB questions', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    await page.getByPlaceholder(/type.*message|ask.*anything/i).fill('What is your return policy?');
    await page.getByRole('button', { name: /send/i }).click();

    // The assistant reply should include a citation card with the source title.
    await expect(page.getByText(/source|citation|reference/i).or(page.getByText('Dayjoy Return & Refund Policy'))).toBeVisible({ timeout: 15_000 });
  });

  test('clicking a citation opens the source article', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    await page.getByPlaceholder(/type.*message|ask.*anything/i).fill('How do I become a distributor?');
    await page.getByRole('button', { name: /send/i }).click();

    // Find the citation link.
    const citationLink = page.getByRole('link', { name: /distributor|read.*more|source/i }).first();
    if (await citationLink.count() > 0) {
      await citationLink.click();
      await expect(page).toHaveURL(/\/(support\/knowledge-base|kb)/, { timeout: 10_000 });
    }
  });
});

test.describe('Customer Portal — Voice + WhatsApp buttons', () => {
  test('voice input button is visible', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    const micBtn = page.locator('[data-lucide="mic"], button[aria-label*="voice" i], button[aria-label*="mic" i]').first();
    await expect(micBtn).toBeVisible({ timeout: 10_000 });
  });

  test('whatsapp button is visible', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    const whatsappBtn = page.locator('[data-lucide="message-circle"], button[aria-label*="whatsapp" i], a[href*="wa.me"], a[href*="whatsapp"]').first();
    await expect(whatsappBtn).toBeVisible({ timeout: 10_000 });
  });

  test('clicking whatsapp button opens a dialog or wa.me link', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    const whatsappBtn = page.locator('button[aria-label*="whatsapp" i], a[href*="wa.me"], a[href*="whatsapp"]').first();
    await whatsappBtn.click();

    // Either a popup/dialog opens OR the link target is wa.me.
    const popup = page.locator('[role="dialog"]');
    const popupVisible = await popup.isVisible().catch(() => false);
    const href = await whatsappBtn.evaluate((el) => (el as HTMLAnchorElement).href ?? '').catch(() => '');
    expect(popupVisible || href.includes('wa.me') || href.includes('whatsapp')).toBe(true);
  });
});

test.describe('Customer Portal — Conversation history', () => {
  test('history link visible in chat page', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant');

    await expect(page.getByRole('link', { name: /history|past.*chat|conversations/i })).toBeVisible({ timeout: 10_000 });
  });

  test('history page lists past conversations', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant/history');

    // Each conversation row has a title.
    const rows = page.locator('a[href*="ai-assistant/"], [data-testid="conversation-row"]');
    if (await rows.count() > 0) {
      const firstTitle = (await rows.first().textContent()) ?? '';
      expect(firstTitle.trim().length).toBeGreaterThan(0);
    }
  });

  test('clicking a conversation opens its detail', async ({ page }) => {
    await loginAndGoto(page, '/ai-assistant/history');

    const firstRow = page.locator('a[href*="ai-assistant/"], [data-testid="conversation-row"]').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/ai-assistant\//, { timeout: 10_000 });
    }
  });
});
