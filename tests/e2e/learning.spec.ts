import { expect, test, type Page } from "@playwright/test";
import { findSet, registerUser } from "./fixtures";

const SLOW_SAVE_MS = 3000;

/** Simulates a slow network for review writes so the UI cannot be waiting on them. */
async function slowReviewSaves(page: Page) {
  await page.route("**/api/v1/reviews", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, SLOW_SAVE_MS));
    await route.continue();
  });
}

test.skip(
  process.env.NEXT_PUBLIC_DATA_SOURCE !== "http",
  "Review writes only go to the server in HTTP mode",
);

test("Learn shows the answer result before the review save returns", async ({ page }) => {
  await registerUser(page);
  const set = await findSet(page, "IELTS");
  await slowReviewSaves(page);
  await page.goto(`/study/${set.id}/learn`);
  await page.getByRole("button", { name: "Bắt đầu học" }).click();
  // Options are visually styled labels around an sr-only radio input.
  await page.locator("label:has(input[type=radio])").first().click();

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/reviews") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Kiểm tra đáp án" }).click();
  await expect(page.getByText(/Chính xác!|Chưa đúng/)).toBeVisible({ timeout: 1000 });
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("button", { name: "Kiểm tra đáp án" })).toBeVisible({
    timeout: 1000,
  });
  expect((await saved).status()).toBe(200);
});

test("Review moves to the next card before the rating save returns", async ({ page }) => {
  await registerUser(page);
  await slowReviewSaves(page);
  await page.goto("/review");
  await page.getByRole("button", { name: /^Ôn \d+ thẻ$/ }).click();
  await expect(page.getByRole("progressbar", { name: /^Đã ôn 0\// })).toBeVisible();
  await page.getByRole("button", { name: "Hiện đáp án" }).click();

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/reviews") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Tốt" }).click();
  await expect(page.getByRole("progressbar", { name: /^Đã ôn 1\// })).toBeVisible({
    timeout: 1000,
  });
  await expect(page.getByRole("button", { name: "Hiện đáp án" })).toBeVisible();
  expect((await saved).status()).toBe(200);
});
