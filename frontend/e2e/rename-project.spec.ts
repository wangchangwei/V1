import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("Rename Project", () => {
  test("should rename a project via dropdown menu", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Wait for project cards to load
    await page.waitForSelector('[class*="animate-spin"]', { state: "hidden", timeout: 10000 }).catch(() => {});
    const cards = page.locator(".space-y-3 > div");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    const firstCard = cards.first();

    // Open dropdown
    const allButtons = firstCard.locator("button");
    await allButtons.nth(await allButtons.count() - 1).click();

    // Click Rename
    const renameBtn = page.getByRole("button", { name: /rename|重命名/i });
    await expect(renameBtn).toBeVisible();
    await renameBtn.click();

    // Modal appears
    const modal = page.locator(".fixed.inset-0.z-50");
    const input = modal.locator('input[type="text"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Enter new name via keyboard (triggers React onChange reliably)
    const newName = `Renamed ${Date.now()}`;
    await input.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(newName);
    await expect(input).toHaveValue(newName, { timeout: 2000 });

    // Save
    const saveBtn = modal.getByRole("button", { name: /save|保存/i });
    await saveBtn.click();

    // Modal closes
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Card shows new name
    await expect(firstCard.locator("h3")).toHaveText(newName, { timeout: 5000 });
  });

  test("should close rename modal on Escape", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[class*="animate-spin"]', { state: "hidden", timeout: 10000 }).catch(() => {});

    const firstCard = page.locator(".space-y-3 > div").first();
    await firstCard.locator("button").last().click();

    const renameBtn = page.getByRole("button", { name: /rename|重命名/i });
    await renameBtn.click();

    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test("should close rename modal on Cancel", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[class*="animate-spin"]', { state: "hidden", timeout: 10000 }).catch(() => {});

    const firstCard = page.locator(".space-y-3 > div").first();
    await firstCard.locator("button").last().click();

    const renameBtn = page.getByRole("button", { name: /rename|重命名/i });
    await renameBtn.click();

    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal).toBeVisible({ timeout: 5000 });

    const cancelBtn = modal.getByRole("button", { name: /cancel|取消/i });
    await cancelBtn.click();

    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
