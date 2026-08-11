import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Dayjoy AI Enterprise platform.
 *
 * Project split:
 *  - `API`              — REST contract tests against the live API
 *  - `Customer Portal`  — end-user shopping + support journey
 *  - `Distributor Portal` — distributor sales + commissions journey
 *  - `Employee Portal`  — internal CRM + AI assistant journey
 *  - `Admin Dashboard`  — tenant + user + audit administration
 *
 * Each project's `testDir` is relative to this file. The full E2E
 * suite (`testing/e2e/`) covers cross-portal journeys (e.g. "distributor
 * creates order → customer receives WhatsApp confirmation").
 *
 * Default `baseURL` points at the local dev server; override with the
 * `E2E_BASE_URL` env var for staging / preview environments.
 */
export default defineConfig({
  testDir: '../e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'testing/.playwright-report' }],
    ['json', { outputFile: 'testing/test-results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Re-use auth state across tests in the same project so we don't
    // log in 50 times per suite.
    storageState: process.env.E2E_STORAGE_STATE,
    // Generous per-test timeout — some AI flows take 10+ seconds end-to-end.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'API',
      testDir: '../api',
      testMatch: /.*\.api\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Customer Portal',
      testDir: '../portals/customer',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'testing/.auth/customer.json',
      },
      dependencies: ['setup:customer'],
    },
    {
      name: 'Distributor Portal',
      testDir: '../portals/distributor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'testing/.auth/distributor.json',
      },
      dependencies: ['setup:distributor'],
    },
    {
      name: 'Employee Portal',
      testDir: '../portals/employee',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'testing/.auth/employee.json',
      },
      dependencies: ['setup:employee'],
    },
    {
      name: 'Admin Dashboard',
      testDir: '../portals/admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'testing/.auth/admin.json',
      },
      dependencies: ['setup:admin'],
    },
    // Auth-setup projects — run once, save the signed-in storage state
    // to disk so the portal projects above can re-use it.
    {
      name: 'setup:customer',
      testMatch: /global\.setup\.customer\.ts/,
    },
    {
      name: 'setup:distributor',
      testMatch: /global\.setup\.distributor\.ts/,
    },
    {
      name: 'setup:employee',
      testMatch: /global\.setup\.employee\.ts/,
    },
    {
      name: 'setup:admin',
      testMatch: /global\.setup\.admin\.ts/,
    },
    // Mobile viewports for responsive verification.
    {
      name: 'Mobile Chrome — Customer Portal',
      testDir: '../portals/customer',
      use: {
        ...devices['Pixel 5'],
        storageState: 'testing/.auth/customer.json',
      },
      dependencies: ['setup:customer'],
    },
    {
      name: 'Mobile Safari — Customer Portal',
      testDir: '../portals/customer',
      use: {
        ...devices['iPhone 13'],
        storageState: 'testing/.auth/customer.json',
      },
      dependencies: ['setup:customer'],
    },
  ],
  outputDir: 'testing/.playwright-output',
});
