import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("Create Project from Prompt", () => {
  test("should create a simple login page project", async ({ page }) => {
    // 1. Go to homepage
    await page.goto(BASE_URL);

    // 2. Wait for model dropdown to load with MiniMax models
    const modelDropdown = page.getByRole("button").filter({ hasText: /MiniMax/ });
    await expect(modelDropdown).toBeVisible({ timeout: 10000 });

    // 3. Type prompt into the textarea
    const textarea = page.locator("textarea");
    await textarea.fill("简易的登录页面");

    // 4. Submit the form
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // 5. Wait for navigation to project page
    await page.waitForURL(/\/projects\/.+/, { timeout: 30000 });

    // 6. Verify we're on a project page
    expect(page.url()).toMatch(/\/projects\/.+\?prompt=/);
    expect(decodeURIComponent(page.url())).toContain("简易的登录页面");

    // 7. Verify model param is in URL
    expect(page.url()).toContain("model=");

    // 8. Wait for chat interface to be ready (wait for the page to settle)
    await page.waitForLoadState("networkidle");
  });
});
