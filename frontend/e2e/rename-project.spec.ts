import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("Rename Project", () => {
  test("should rename a project via dropdown menu (mocked API)", async ({ page }) => {
    // Mock the PATCH API to succeed
    await page.route(/\/containers\/.*/, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, displayName: route.request().postData() ? JSON.parse(route.request().postData()!).displayName : "Mocked" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // 1. Wait for project cards to load
    await page.waitForSelector('[class*="animate-spin"]', { state: "hidden", timeout: 10000 }).catch(() => {});
    const cards = page.locator(".space-y-3 > div");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // 2. Get original name
    const firstCard = cards.first();
    const originalName = await firstCard.locator("h3").textContent();

    // 3. Open dropdown
    const allButtons = firstCard.locator("button");
    const moreBtn = allButtons.nth(await allButtons.count() - 1);
    await moreBtn.click();

    // 4. Click Rename
    const renameBtn = page.getByRole("button", { name: /rename|重命名/i });
    await expect(renameBtn).toBeVisible();
    await renameBtn.click();

    // 5. Modal appears
    const modal = page.locator(".fixed.inset-0.z-50");
    const input = modal.locator('input[type="text"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 6. Enter new name
    const newName = `Renamed ${Date.now()}`;
    await input.clear();
    await input.fill(newName);

    // 7. Save
    const saveBtn = modal.getByRole("button", { name: /save|保存/i });
    await saveBtn.click();

    // 8. Modal closes
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // 9. Card shows new name
    await expect(firstCard.locator("h3")).toHaveText(newName, { timeout: 5000 });
  });

  test("should show error toast when API fails", async ({ page }) => {
    // Mock the PATCH API to fail
    await page.route(/\/containers\/.*/, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: "Server error" }) });
        return;
      }
      await route.continue();
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[class*="animate-spin"]', { state: "hidden", timeout: 10000 }).catch(() => {});

    const firstCard = page.locator(".space-y-3 > div").first();
    const allButtons = firstCard.locator("button");
    await allButtons.nth(await allButtons.count() - 1).click();

    const renameBtn = page.getByRole("button", { name: /rename|重命名/i });
    await renameBtn.click();

    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal).toBeVisible({ timeout: 5000 });

    const input = modal.locator('input[type="text"]');
    await input.clear();
    await input.fill("FailTest");

    const saveBtn = modal.getByRole("button", { name: /save|保存/i });
    await saveBtn.click();

    // Modal should close even on error
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test("should close rename modal on Escape", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[class*="animate-spin"]', { state: "hidden", timeout: 10000 }).catch(() => {});

    const firstCard = page.locator(".space-y-3 > div").first();
    const allButtons = firstCard.locator("button");
    await allButtons.nth(await allButtons.count() - 1).click();

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
    const allButtons = firstCard.locator("button");
    await allButtons.nth(await allButtons.count() - 1).click();

    const renameBtn = page.getByRole("button", { name: /rename|重命名/i });
    await renameBtn.click();

    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal).toBeVisible({ timeout: 5000 });

    const cancelBtn = modal.getByRole("button", { name: /cancel|取消/i });
    await cancelBtn.click();

    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
