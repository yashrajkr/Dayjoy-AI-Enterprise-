import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("dashboard page loads and shows KPIs", async ({ page }) => {
    await page.goto("/dashboard");

    // Page title
    await expect(page).toHaveTitle(/Dayjoy AI Platform/);

    // KPI cards are visible
    await expect(page.getByText("Active Conversations")).toBeVisible();
    await expect(page.getByText("Chat Sessions")).toBeVisible();
    await expect(page.getByText("Avg Response Time")).toBeVisible();
    await expect(page.getByText("Deflection Rate")).toBeVisible();
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/dashboard");

    // Click Customers in sidebar
    await page.getByRole("link", { name: /Customers/ }).click();
    await expect(page).toHaveURL(/\/customers$/);

    // Click Products
    await page.getByRole("link", { name: /Products/ }).click();
    await expect(page).toHaveURL(/\/products$/);

    // Back to Dashboard
    await page.getByRole("link", { name: /Dashboard/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("Login page", () => {
  test("login form is visible", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText(/Sign in to your account/)).toBeVisible();
    await expect(page.getByLabel(/Email/)).toBeVisible();
    await expect(page.getByLabel(/Password/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign In/ })).toBeVisible();
  });
});
