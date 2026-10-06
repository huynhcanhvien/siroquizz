import { expect, test } from "@playwright/test";
import { registerUser } from "./fixtures";

// Loads the OCR runtime and models (~30 MB) on first use.
test.describe.configure({ timeout: 120_000 });

test("reads a scanned image on the device and uploads only its text", async ({ page }) => {
  // Records what the page uploads (Playwright does not expose File request bodies).
  await page.addInitScript(() => {
    const send = window.fetch.bind(window);
    const uploads: string[] = [];
    Object.assign(window, { uploads });
    window.fetch = async (input, init) => {
      if (init?.method === "PUT" && init.body instanceof Blob) uploads.push(await init.body.text());
      return send(input, init);
    };
  });
  await registerUser(page);
  await page.goto("/sets/new/ai");
  await page.getByLabel("Ngôn ngữ thuật ngữ").selectOption("zh");
  await page.getByLabel("Chọn tệp").setInputFiles("tests/fixtures/ocr-sample.png");
  await page.getByRole("textbox", { name: "Yêu cầu cho AI" }).fill("Tạo thẻ từ vựng");

  const announced = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/v1/ai/uploads"),
  );
  await page.getByRole("button", { name: "Tạo thẻ" }).click();
  await expect(page.getByText("Đọc bản scan trên máy bạn")).toBeVisible();

  expect((await announced).postDataJSON()).toMatchObject({
    name: "ocr-sample.txt",
    mime: "text/plain",
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { uploads: string[] }).uploads.join("")))
    .toMatch(/我们每天早上喝茶，\s*晚上看书。/);
});
