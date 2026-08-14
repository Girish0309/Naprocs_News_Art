import { test, expect } from "@playwright/test";
import { seedPublishedArticle } from "./helpers/seed";

// T-098: the public reader's continuous path — browse, search, read, comment, like —
// against a real running dev server and a real (isolated) database. The article is
// seeded directly (mongoose, not through the admin UI) since this flow is about the
// PUBLIC/anonymous surface, not re-testing article creation (that's T-097's job).
test("full public reader flow: browse, search, open, comment, like", async ({ page }) => {
  const uniqueMarker = `E2ESearchable${Date.now()}`;
  const title = `Public Flow Test Essay ${uniqueMarker}`;
  const slug = `public-flow-test-essay-${Date.now()}`;
  await seedPublishedArticle({ title, slug });

  await test.step("browse the homepage", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  await test.step("search inline for it", async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const searchInput = page.getByLabel("Search essays, authors, topics");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(uniqueMarker);

    // Debounced (300ms) + a real /api/search round trip — wait for the result itself
    // rather than an arbitrary timeout.
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 10_000 });
  });

  await test.step("open the article", async () => {
    await page.getByRole("heading", { name: title }).click();
    await expect(page).toHaveURL(new RegExp(`/articles/${slug}$`));
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  await test.step("submit a comment", async () => {
    await page.locator("#name").fill("An E2E Reader");
    await page.locator("#comment").fill("This is a perfectly ordinary, non-spammy test comment.");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("An E2E Reader")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("This is a perfectly ordinary, non-spammy test comment.")).toBeVisible();
  });

  await test.step("like the article", async () => {
    const likeButton = page.getByRole("button", { name: "Like this article" });
    await expect(likeButton).toBeVisible();
    await likeButton.click();

    await expect(page.getByRole("button", { name: "Unlike this article" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Unlike this article" })).toHaveAttribute("aria-pressed", "true");
  });
});
