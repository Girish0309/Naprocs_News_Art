import path from "node:path";
import { test, expect } from "@playwright/test";
import { seedAdmin } from "./helpers/seed";

const ADMIN_EMAIL = "e2e-admin-flow@test.local";
const ADMIN_PASSWORD = "CorrectHorseBattery1";
const COVER_IMAGE_PATH = path.join(__dirname, "fixtures", "test-cover.png");

// T-097: the single most interaction-sensitive path in the app — the thing most likely
// to break from a change in one module colliding with another, rather than any one
// module's own logic in isolation. Runs as one continuous flow (not split into smaller
// independent tests) for exactly that reason: login -> create -> upload -> publish ->
// confirm live, against a real running dev server and a real (isolated, in-memory)
// database.
test("full admin flow: login, create, upload cover, publish, confirm live", async ({ page }) => {
  await seedAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);

  const articleTitle = `E2E Admin Flow Article ${Date.now()}`;

  await test.step("log in", async () => {
    await page.goto("/admin/login");
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByText("Newsletter Console")).toBeVisible();
  });

  await test.step("create a new article", async () => {
    // "New Article" appears twice (sidebar nav + dashboard header button) — scope to
    // the dashboard's own <main> content to disambiguate.
    await page.getByRole("main").getByRole("link", { name: "New Article" }).click();
    await expect(page).toHaveURL(/\/admin\/articles\/new$/);

    await page.getByLabel("Article title").fill(articleTitle);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(
      "This is the seeded body content for the full admin flow end-to-end test, written directly into the Tiptap editor."
    );
  });

  await test.step("upload a cover image", async () => {
    await page.locator('input[type="file"]').setInputFiles(COVER_IMAGE_PATH);
    // CoverImageUploader moves idle -> uploading -> processing -> verified; "Asset
    // Verified" only renders in the last state, so waiting for it is waiting for the
    // real (mocked-Cloudinary) upload round trip to actually finish.
    await expect(page.getByText("Asset Verified")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Cover image alt text").fill("An E2E test cover image.");
  });

  let publicUrl = "";
  await test.step("publish", async () => {
    await page.getByRole("button", { name: /publish/i }).click();
    await expect(page.getByText("Published", { exact: true })).toBeVisible({ timeout: 10_000 });

    const viewLiveLink = page.getByRole("link", { name: /view live/i });
    await expect(viewLiveLink).toBeVisible();
    const href = await viewLiveLink.getAttribute("href");
    if (!href) throw new Error("Expected a 'View live' link with an href once published.");
    publicUrl = href;
  });

  await test.step("confirm it's live on its own page", async () => {
    await page.goto(publicUrl);
    await expect(page.getByRole("heading", { name: articleTitle })).toBeVisible();
  });

  await test.step("confirm it's live on the public homepage", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: articleTitle })).toBeVisible();
  });

  await test.step("Settings page renders both cards", async () => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site Metadata" })).toBeVisible();
  });

  await test.step("log out clears the session for real", async () => {
    await page.getByRole("button", { name: "Log Out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // logout() (lib/auth-actions.ts, a Server Action) can't be reached from Vitest —
    // it needs a real next/headers request scope — so this is its only real coverage:
    // confirm the session cookie is actually gone, not just that the page redirected.
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
