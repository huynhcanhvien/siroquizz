import { expect, test, type Page } from "@playwright/test";
import { registerUser } from "./fixtures";

const STEP_URL = "**/api/v1/ai/jobs/*/step";

/** Starts a generation from a word list, holding its steps so it is still running afterwards. */
async function startHeldGeneration(page: Page) {
  await registerUser(page);
  await page.goto("/sets/new/ai");
  await page.getByLabel("Chọn tệp").setInputFiles({
    name: "dong-vat.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("cat - con mèo\ndog - con chó\nbird - con chim\nfish - con cá"),
  });
  await page.route(STEP_URL, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue().catch(() => {});
  });
  const firstStep = page.waitForRequest(
    (request) => request.url().endsWith("/step") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Tạo thẻ" }).click();
  await expect(page.getByRole("heading", { name: "AI đang làm việc…" })).toBeVisible();
  await expect(page.getByText("Bạn có thể chuyển sang trang khác")).toBeVisible();
  await firstStep;
}

const indicator = (page: Page, name: string | RegExp) =>
  page.getByRole("status").getByRole("link", { name });

test("keeps generating while the user goes to other pages, then opens the result", async ({
  page,
}) => {
  await startHeldGeneration(page);

  await page.getByRole("navigation").getByRole("link", { name: "Thư viện" }).first().click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(indicator(page, /AI đang tạo thẻ/)).toBeVisible();

  await page.unroute(STEP_URL);
  await expect(page.getByText("Bộ thẻ AI đã sẵn sàng — mở Tạo bằng AI để xem lại.")).toBeVisible({
    timeout: 30_000,
  });
  await indicator(page, /Bộ thẻ AI đã sẵn sàng/).click();

  await expect(page).toHaveURL(/\/sets\/new\/ai$/);
  await expect(page.getByRole("heading", { name: "Xem lại và chỉnh sửa" })).toBeVisible();
  await expect(page.getByRole("status").getByRole("link")).toHaveCount(0);
  await page.getByRole("button", { name: "Lưu 4 thẻ" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Bộ thẻ AI: dong-vat" })).toBeVisible();
  await expect(indicator(page, /AI/)).toHaveCount(0);
});

test("picks up an unfinished generation after the page is reloaded", async ({ page }) => {
  await startHeldGeneration(page);

  // A full page load ends every script on the page; the job waits on the server.
  await page.unroute(STEP_URL);
  await page.goto("/library");
  await expect(page.getByText("Đang tiếp tục lần tạo thẻ bằng AI còn dở.")).toBeVisible();
  await expect(indicator(page, /Bộ thẻ AI đã sẵn sàng/)).toBeVisible({ timeout: 30_000 });
  await indicator(page, /Bộ thẻ AI đã sẵn sàng/).click();
  await expect(page.getByText("Đã chọn 4/4")).toBeVisible();
});
