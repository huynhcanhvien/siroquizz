import { expect, test } from "@playwright/test";
import { findSet, registerUser } from "./fixtures";

test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Folders need the server backend");

test("files sets into a folder and studies the whole folder", async ({ page }) => {
  await registerUser(page);
  const hsk = await findSet(page, "HSK");
  const sets = await page.request.get("/api/v1/sets?limit=50").then((r) => r.json());
  const other = (sets.data as { id: string; title: string }[]).find((set) => set.id !== hsk.id)!;

  await page.goto("/folders");
  await page.getByRole("textbox", { name: "Tên thư mục" }).fill("Ôn thi");
  await page.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(page.getByText("Đã tạo thư mục.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ôn thi/ })).toContainText("0 bộ thẻ");

  // Add from the set page menu…
  await page.goto(`/sets/${hsk.id}`);
  await page.getByRole("button", { name: "Tùy chọn khác" }).click();
  await page.getByRole("menuitem", { name: "Thêm vào thư mục" }).click();
  await page.getByLabel("Ôn thi").check();
  await expect(page.getByText("Đã cập nhật thư mục.")).toBeVisible();
  await page.keyboard.press("Escape");

  // …and by dragging a card onto the folder chip in the library.
  await page.goto("/library");
  const chip = page
    .getByRole("navigation", { name: "Thư mục" })
    .getByRole("link", { name: /Ôn thi/ });
  await expect(chip).toContainText("1");
  await page.getByRole("listitem").filter({ hasText: other.title }).first().dragTo(chip);
  await expect(page.getByText("Đã cập nhật thư mục.")).toBeVisible();
  await expect(chip).toContainText("2");

  await chip.click();
  await expect(page.getByRole("heading", { level: 1, name: "Ôn thi" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(other.title) })).toBeVisible();

  // Whole-folder flashcards are practice: nothing is saved per set.
  const saves: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/progress"))
      saves.push(request.url());
  });
  await page.getByRole("link", { name: "Thẻ ghi nhớ" }).click();
  await expect(page.getByText("Luyện tập: không lưu tiến độ")).toBeVisible();
  await page.getByRole("button", { name: "Đã biết" }).click();
  await page.getByRole("button", { name: "Đã biết" }).click();
  expect(saves).toEqual([]);
  await page.getByRole("link", { name: "Về thư mục" }).click();

  await page.getByRole("main").getByRole("link", { name: "Ôn tập" }).click();
  await expect(page.getByText("Đang ôn thư mục “Ôn thi”.")).toBeVisible();

  // Deleting the folder keeps its sets.
  await page.goto("/folders");
  await page.getByRole("link", { name: /Ôn thi/ }).click();
  await page.getByRole("button", { name: "Xóa thư mục" }).click();
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(page).toHaveURL(/\/folders$/);
  await page.goto(`/sets/${hsk.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("HSK");
});
