import { expect, test } from "@playwright/test";
import { findSet, registerUser } from "./fixtures";

test("switches phonetic placement after opening a set from Continue studying", async ({ page }) => {
  await registerUser(page);
  const set = await findSet(page, "HSK");
  await page.goto(`/study/${set.id}/flashcards`);
  await expect(page.getByRole("button", { name: "Phiên âm: dưới thuật ngữ" })).toBeVisible();
  await page.getByRole("link", { name: "Thoát" }).click();
  await page.goto("/home");
  await page.getByRole("region", { name: "Tiếp tục học" }).getByRole("link", { name: /HSK/ }).click();
  await expect(page).toHaveURL(`/study/${set.id}/flashcards`);

  const visibleText = page.locator(".flip-face:not([aria-hidden=true]) p");
  await expect(visibleText).toHaveCount(2);
  const phonetic = (await visibleText.nth(1).textContent()) ?? "";
  expect(phonetic).not.toBe("");
  await page.getByRole("button", { name: "Phiên âm: dưới thuật ngữ" }).click();
  await expect(page.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toBeVisible();
  await expect(visibleText).toHaveCount(1);
  await page.getByRole("button", { name: "Lật thẻ" }).click();
  await expect(visibleText.nth(1)).toHaveText(phonetic);
  await page.reload();
  await expect(page.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toBeVisible();
  await expect(visibleText).toHaveCount(1);
});

test("creates a set, flips through flashcards and records progress", async ({ page }) => {
  await registerUser(page);
  await page.goto("/sets/new");

  await page.getByLabel("Tiêu đề").fill("Trái cây");
  const pairs = [
    ["apple", "quả táo"],
    ["pear", "quả lê"],
    ["plum", "quả mận"],
    ["grape", "quả nho"],
  ];
  for (const [index, [term, definition]] of pairs.entries()) {
    const terms = page.getByLabel("Thuật ngữ", { exact: true });
    const definitions = page.getByLabel("Định nghĩa", { exact: true });
    await terms.nth(index).fill(term);
    await definitions.nth(index).fill(definition);
    if (index >= 2 && index < pairs.length - 1) await definitions.nth(index).press("Tab");
  }
  await page.getByRole("button", { name: "Tạo bộ thẻ" }).first().click();

  await expect(page.getByRole("heading", { level: 1, name: "Trái cây" })).toBeVisible();
  await expect(page.getByText("4 thẻ").first()).toBeVisible();

  await page.getByRole("link", { name: /Thẻ ghi nhớ/ }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Đã biết" }).click();
  await expect(page.getByText("2 / 4")).toBeVisible();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("1");
  await expect(page.getByRole("heading", { name: "Bạn đã học hết một vòng!" })).toBeVisible();
  await expect(page.getByText("Đã biết 1 · Đang học 3")).toBeVisible();

  await page.getByRole("link", { name: "Về bộ thẻ" }).click();
  const progress = page.getByRole("heading", { name: "Tiến độ của bạn" }).locator("..");
  await expect(progress.getByText("Đã thuộc").locator("..")).toContainText("1");
  await expect(progress.getByText("Đang học").locator("..")).toContainText("3");
});

test("imports cards from pasted text", async ({ page }) => {
  await registerUser(page);
  await page.goto("/sets/new?import=1");
  const dialog = page.getByRole("dialog", { name: "Nhập dữ liệu" });
  await dialog.getByLabel("Dữ liệu cần nhập").fill("sun\tmặt trời\nmoon\tmặt trăng\nstar\tngôi sao");
  await expect(dialog.getByText("3 thẻ hợp lệ")).toBeVisible();
  await dialog.getByRole("button", { name: "Nhập 3 thẻ" }).click();

  await page.getByLabel("Tiêu đề").fill("Bầu trời");
  await page.getByRole("button", { name: "Tạo bộ thẻ" }).first().click();
  await expect(page.getByRole("heading", { name: "Thuật ngữ trong bộ này (3)" })).toBeVisible();
});

test("duplicates and deletes a set", async ({ page }) => {
  await registerUser(page);
  await page.getByRole("link", { name: "HSK 1: Chào hỏi & đời sống" }).click();
  await page.getByRole("button", { name: "Tùy chọn khác" }).click();
  await page.getByRole("menuitem", { name: "Nhân bản" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "HSK 1: Chào hỏi & đời sống (bản sao)" })).toBeVisible();

  await page.getByRole("button", { name: "Tùy chọn khác" }).click();
  await page.getByRole("menuitem", { name: "Xóa bộ thẻ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xóa vĩnh viễn" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText("4 bộ thẻ")).not.toBeVisible();
  await expect(page.getByText("3 bộ thẻ")).toBeVisible();
});

test("library search keeps every typed character and mirrors it to the URL", async ({ page }) => {
  await registerUser(page);
  await page.goto("/library");
  const search = page.getByRole("searchbox", { name: "Tìm bộ thẻ" });
  await search.pressSequentially("du lịch", { delay: 10 });
  await expect(search).toHaveValue("du lịch");
  await expect(page.getByRole("link", { name: "Du lịch: Việt → Anh" })).toBeVisible();
  await expect(page.getByRole("link", { name: /IELTS/ })).not.toBeVisible();
  await expect(page).toHaveURL(/q=du\+l%E1%BB%8Bch|q=du%20l%E1%BB%8Bch/);

  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Tìm bộ thẻ" })).toHaveValue("du lịch");
});
