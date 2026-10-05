import { expect, test } from "@playwright/test";
import { registerUser } from "./fixtures";

test("generates cards from an uploaded text file and saves them as a set", async ({ page }) => {
  await registerUser(page);
  await page.goto("/sets/new/ai");

  await page.getByLabel("Chọn tệp").setInputFiles({
    name: "dong-vat.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("cat - con mèo\ndog - con chó\nbird - con chim\nfish - con cá"),
  });
  await expect(page.getByText("dong-vat.txt")).toBeVisible();
  await page.getByRole("button", { name: "Tạo thẻ" }).click();

  await expect(page.getByRole("heading", { name: "AI đang làm việc…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Xem lại và chỉnh sửa" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Đã chọn 4/4")).toBeVisible();

  await page.getByLabel("Giữ thẻ 4").uncheck();
  await expect(page.getByText("Đã chọn 3/4")).toBeVisible();
  await page.getByRole("button", { name: "Lưu 3 thẻ" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Bộ thẻ AI: dong-vat" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thuật ngữ trong bộ này (3)" })).toBeVisible();
});

test("rejects unsupported files and can cancel a generation", async ({ page }) => {
  await registerUser(page);
  await page.goto("/sets/new/ai");
  await page
    .getByLabel("Chọn tệp")
    .setInputFiles({ name: "song.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3") });
  await expect(page.getByText("song.mp3: định dạng không được hỗ trợ.")).toBeVisible();

  await page.getByRole("textbox", { name: "Yêu cầu cho AI" }).fill("Trích 10 từ vựng HSK 2");
  await page.getByRole("button", { name: "Tạo thẻ" }).click();
  await page.getByRole("button", { name: "Hủy" }).click();
  await expect(page.getByText("Đã hủy tạo thẻ.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo thẻ" })).toBeVisible();
});

test("asks to confirm the credit cost of a large request and can decline it", async ({ page }) => {
  await registerUser(page);
  await page.goto("/sets/new/ai");
  await expect(page.getByText(/Hôm nay còn 20\/20 credit miễn phí/)).toBeVisible();
  await page.getByRole("textbox", { name: "Yêu cầu cho AI" }).fill("Từ vựng tiếng Anh về nhà bếp");
  await page.getByLabel("Số thẻ").fill("200");
  await page.getByRole("button", { name: "Tạo thẻ" }).click();

  await expect(page.getByRole("heading", { name: "Xác nhận chi phí" })).toBeVisible();
  await expect(page.getByText(/Tạo 200 thẻ sẽ dùng khoảng \d+ credit/)).toBeVisible();
  const confirm = page.getByRole("button", { name: /Tạo thẻ \(\d+ credit\)/ });
  await expect(confirm).toBeEnabled();
  await page.getByRole("button", { name: "Hủy" }).click();
  await expect(page.getByText("Đã hủy tạo thẻ.")).toBeVisible();
  // Nothing was generated, so nothing was charged.
  await expect(page.getByText(/Hôm nay còn 20\/20 credit miễn phí/)).toBeVisible();
});
