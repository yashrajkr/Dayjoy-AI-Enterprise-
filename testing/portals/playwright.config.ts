import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Dayjoy portal E2E tests.
 *
 * Portal tests live in `testing/portals/{customer,distributor,employee,admin}/`
 * and target four separate Next.js apps (each on its own dev port). Set the
 * base URLs via env vars so CI can override them; defaults point at a local
 * dev server started with `pnpm dev` in each portal workspace.
 *
 *   E2E_CUSTOMER_BASE_URL=http://localhost:3005  (apps/customer-portal)
 *   E2E_DISTRIBUTOR_BASE_URL=http://localhost:3006 (apps/distributor-portal)
 *   E2E_EMPLOYEE_BASE_URL=http://localhost:3007   (apps/employee-portal)
 *   E2E_ADMIN_BASE_URL=http://localhost:3001      (apps/admin-dashboard)
 *
 * The projects matrix covers Chromium + WebKit + Mobile Chrome so we catch
 * responsive layout regressions in the same run as desktop regressions.
 *
 * The mock backend (startMockBackend in helpers/mock-backend.ts) is the
 * default backend — wire it up in a global setup if no real backend is
 * reachable.
 */
export default defineConfig({
  testDir: './portals',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',

  use: {
    // Each portal page sets its own baseURL via test.use({ baseURL }), so
    // this is just a sensible default for tests that don't.
    baseURL: process.env.E2E_CUSTOMER_BASE_URL ?? 'http://localhost:3005',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Inject a fake auth token so authenticated routes don't bounce to /login.
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Auto-start the customer portal dev server if not already running.
  // Override per-portal in CI by setting E2E_CUSTOMER_BASE_URL etc.
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'pnpm --filter customer-portal dev',
        url: process.env.E2E_CUSTOMER_BASE_URL ?? 'http://localhost:3005',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
