import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("Deploy", () => {
  test("should open deploy modal when clicking Deploy button", async ({ page }) => {
    // Go to a project page directly
    await page.goto(`${BASE_URL}/projects/test-container-id`);
    await page.waitForLoadState("networkidle");

    // Find and click the Deploy button
    const deployBtn = page.locator("button", { hasText: /deploy/i }).first();
    await expect(deployBtn).toBeVisible();
    await deployBtn.click();

    // Modal should appear
    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal).toBeVisible({ timeout: 3000 });

    // Should have token input
    const tokenInput = modal.locator('input[type="password"]');
    await expect(tokenInput).toBeVisible();

    // Should have Deploy and Cancel buttons
    const deployConfirmBtn = modal.locator("button.bg-white:has-text('Deploy')");
    await expect(deployConfirmBtn).toBeVisible();

    // Cancel should close modal
    const cancelBtn = modal.locator("button:has-text('Cancel')");
    await cancelBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test("should close deploy modal on Escape", async ({ page }) => {
    await page.goto(`${BASE_URL}/projects/test-container-id`);
    await page.waitForLoadState("networkidle");

    const deployBtn = page.locator("button", { hasText: /deploy/i }).first();
    await deployBtn.click();

    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
