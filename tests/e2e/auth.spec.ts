import { expect, test } from "@playwright/test";
import { registerUser, TEST_PASSWORD } from "./fixtures";

test("redirects guests from protected pages to login and back after signing in", async ({ page }) => {
  const email = await registerUser(page);
  await page.getByRole("button", { name: /Tài khoản/ }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/library");
  await expect(page).toHaveURL(/\/login\?next=%2Flibrary$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("sai-mat-khau-1");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email hoặc mật khẩu không đúng." })).toBeVisible();

  await page.getByLabel("Mật khẩu", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test("registration seeds three sample sets", async ({ page }) => {
  await registerUser(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bạn Test");
  await expect(page.getByRole("link", { name: "IELTS cơ bản: 12 từ học thuật" })).toBeVisible();
  await expect(page.getByRole("link", { name: "HSK 1: Chào hỏi & đời sống" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Du lịch: Việt → Anh" })).toBeVisible();
});

test("shows validation errors in the selected language", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Bạn cần đồng ý với điều khoản để tiếp tục.")).toBeVisible();
  await expect(page.getByText("Mật khẩu cần ít nhất 8 ký tự.")).toBeVisible();
});

test("switches the interface language between Vietnamese, Chinese and English", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chào mừng trở lại");

  await page.getByRole("button", { name: /Ngôn ngữ/ }).click();
  await page.getByRole("menuitemradio", { name: "中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("欢迎回来");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");

  await page.getByRole("button", { name: /语言/ }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back");
});
