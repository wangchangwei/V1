/**
 * Edit-and-Regenerate E2E Tests
 *
 * Status: SKIPPED — fixture support not yet available.
 *
 * These tests require a running dev environment AND a project with chat
 * history to be useful. The current E2E setup has no project/chat fixture
 * bootstrap, no LLM mock, and no way to seed a container with a known
 * message history. The actual flow tests are therefore marked as
 * test.skip() so CI stays green, but the test bodies are written out
 * with stable selectors (data-testid="chat-message" + data-role) so they
 * can be enabled as soon as project fixture support is added (see plan
 * §Task 5).
 *
 * What is actually covered today:
 *   - 1 sanity test that just verifies the chat panel route renders
 *     without crashing when given a bogus container id. This guards
 *     against the URL/route breaking between releases.
 *
 * What will be covered once fixtures exist:
 *   - edit-and-regenerate: hover a user message, click Edit, modify
 *     text, click Regenerate, expect PATCH request and new assistant
 *     response.
 *   - cancel-without-api-call: click Edit, modify text, click Cancel,
 *     expect no network request was made and original text is intact.
 */

import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const TEST_CID = process.env.E2E_CONTAINER_ID ?? "test-cid";

test.describe("Edit-and-Regenerate", () => {
  test("chat panel route renders without crashing (smoke)", async ({ page }) => {
    // This test does not require any chat history. It only verifies the
    // /projects/:cid route loads. If a fixture is available and adds
    // chat history, this test should still pass and is a useful canary.
    await page.goto(`${BASE_URL}/projects/${TEST_CID}`);
    await page.waitForLoadState("networkidle");

    // The route should at minimum render the page chrome. We don't
    // assert on chat content here because no fixture is guaranteed.
    await expect(page).toHaveURL(new RegExp(`/projects/${TEST_CID}`));
  });

  test.skip("edit a user message and regenerate (success path)", async ({ page }) => {
    // REQUIRES: a project with at least one user message in chat history.
    //
    // Plan selectors reference the data-testid/data-role attrs added in
    // ChatMessage.tsx by this same commit. Once a fixture is available:
    //   - E2E_CONTAINER_ID env var should point to a seeded container
    //   - the seeded project should have 1+ user message and 1+ assistant
    //     response so the edit flow can be exercised end to end.

    await page.goto(`${BASE_URL}/projects/${TEST_CID}`);
    await page.waitForLoadState("networkidle");

    // 1. Find the most recent user message.
    const userMessage = page
      .locator('[data-testid="chat-message"][data-role="user"]')
      .last();
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // 2. Hover to reveal the Edit button, then click it.
    await userMessage.hover();
    const editBtn = userMessage.getByRole("button", { name: /edit message/i });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // 3. The textarea should now be visible with the original content.
    const textarea = userMessage.getByRole("textbox", { name: /edit message/i });
    await expect(textarea).toBeVisible();

    // 4. Replace the content.
    const replacement = `Edited at ${Date.now()}`;
    await textarea.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(replacement);
    await expect(textarea).toHaveValue(replacement);

    // 5. Track the PATCH request that edit-and-regenerate should fire.
    const patchPromise = page.waitForRequest(
      (req) => req.method() === "PATCH" && /\/api\/.*\/messages\//.test(req.url()),
      { timeout: 15000 }
    );

    // 6. Click Regenerate.
    const regenBtn = userMessage.getByRole("button", { name: /regenerating/i });
    await regenBtn.click();

    // 7. PATCH fires with the new content.
    const patchReq = await patchPromise;
    const body = patchReq.postDataJSON() as { content?: string };
    expect(body.content).toBe(replacement);

    // 8. After the new assistant response streams in, the edited message
    //    should be visible.
    await expect(userMessage).toContainText(replacement, { timeout: 30000 });
  });

  test.skip("cancel edit without firing API (cancel path)", async ({ page }) => {
    // REQUIRES: a project with at least one user message in chat history.
    //
    // Pure UI test — no LLM stream, no PATCH endpoint needed for the
    // assertion. Still needs the chat panel to be visible, which is
    // why it's gated on fixture availability.

    await page.goto(`${BASE_URL}/projects/${TEST_CID}`);
    await page.waitForLoadState("networkidle");

    const userMessage = page
      .locator('[data-testid="chat-message"][data-role="user"]')
      .last();
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // Capture the original text for later comparison.
    const originalText = (await userMessage.innerText()).trim();
    expect(originalText.length).toBeGreaterThan(0);

    // Track any PATCH calls; the assertion at the end is that none fired.
    const patchCalls: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH" && /\/api\/.*\/messages\//.test(req.url())) {
        patchCalls.push(req.url());
      }
    });

    // Open the editor, type something, then cancel.
    await userMessage.hover();
    await userMessage.getByRole("button", { name: /edit message/i }).click();

    const textarea = userMessage.getByRole("textbox", { name: /edit message/i });
    await textarea.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("This should never be sent");

    const cancelBtn = userMessage.getByRole("button", { name: /cancel/i });
    await cancelBtn.click();

    // Editor closes, original text is intact, no PATCH fired.
    await expect(textarea).not.toBeVisible({ timeout: 5000 });
    await expect(userMessage).toContainText(originalText, { timeout: 5000 });
    expect(patchCalls).toEqual([]);
  });
});
