import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { registerUser } from "./fixtures";

test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Sharing needs the server backend");

const cards = Array.from({ length: 10 }, (_, i) => ({
  term: `ladle ${i}`,
  definition: `cái muôi ${i}`,
}));

/** A signed-in person in their own browser context. */
async function person(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  const email = await registerUser(page, name);
  return { page, email, headers: { Origin: new URL(page.url()).origin } };
}
async function createSet(page: Page, headers: Record<string, string>, title: string) {
  const response = await page.request.post("/api/v1/sets", {
    headers,
    data: {
      title,
      description: "Đồ dùng nhà bếp",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.id as string;
}
async function share(page: Page, headers: Record<string, string>, id: string, visibility: string) {
  const response = await page.request.patch(`/api/v1/sets/${id}/visibility`, {
    headers,
    data: { visibility },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as { slug: string; moderationStatus: string };
}
async function makeAdmin(email: string) {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`update "user" set role = 'admin' where email = ${email}`;
  } finally {
    await sql.end();
  }
}

test("shares a set by link: guests study it, and it disappears when made private", async ({
  browser,
}) => {
  const owner = await person(browser, "Chủ bộ thẻ");
  const id = await createSet(owner.page, owner.headers, "Đồ bếp chia sẻ");
  await owner.page.goto(`/sets/${id}`);
  await owner.page.getByRole("button", { name: /Chia sẻ/ }).click();
  await owner.page.getByText("Có link", { exact: true }).click();
  await expect(owner.page.getByText("Đã cập nhật quyền xem.")).toBeVisible();
  const link = await owner.page.getByLabel("Link chia sẻ").inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9]{10}$/);
  await expect(owner.page.getByRole("img", { name: "Mã QR của link chia sẻ" })).toBeVisible();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { level: 1, name: "Đồ bếp chia sẻ" })).toBeVisible();
  await expect(guest.getByText("Tạo bởi Chủ bộ thẻ")).toBeVisible();
  await expect(guest.getByText("Thẻ 1/10").or(guest.getByText("1/10"))).toBeVisible();
  await guest.getByRole("button", { name: "Thẻ sau" }).click();
  await expect(guest.getByText("2/10")).toBeVisible();
  await expect(guest.getByRole("link", { name: "Đăng nhập để lưu bộ thẻ" })).toBeVisible();

  // Wait for the change itself: the earlier "updated" toast may still be on screen.
  const madePrivate = owner.page.waitForResponse(
    (response) => response.url().endsWith(`/sets/${id}/visibility`) && response.ok(),
  );
  await owner.page.getByText("Riêng tư", { exact: true }).click();
  await madePrivate;
  expect((await guest.goto(link))?.status()).toBe(404);
});

test("a reader copies and reports a set, a moderator takes it down", async ({ browser }) => {
  const owner = await person(browser, "Tác giả");
  // The local database keeps earlier runs' reports, so the title is unique per run.
  const title = `Bộ thẻ bị báo cáo ${Date.now()}`;
  const id = await createSet(owner.page, owner.headers, title);
  const { slug } = await share(owner.page, owner.headers, id, "unlisted");

  const reader = await person(browser, "Người đọc");
  await reader.page.goto(`/s/${slug}`);
  await reader.page.getByRole("button", { name: "Tạo bản sao vào thư viện" }).click();
  await expect(reader.page).toHaveURL(/\/sets\/[0-9a-f-]{36}$/);
  await expect(reader.page.getByText(`Bản sao từ “${title}” của Tác giả`)).toBeVisible();

  await reader.page.goto(`/s/${slug}`);
  await reader.page.getByRole("button", { name: "Báo cáo" }).click();
  await reader.page.getByLabel("Spam hoặc quảng cáo").check();
  await reader.page.getByRole("button", { name: "Gửi báo cáo" }).click();
  await expect(
    reader.page.getByText("Cảm ơn bạn. Quản trị viên sẽ xem xét báo cáo."),
  ).toBeVisible();

  // Only moderators reach the moderation page.
  // (The app shell streams a loading state first, so the not-found page arrives with status 200.)
  await reader.page.goto("/admin");
  await expect(reader.page.getByRole("heading", { name: "Trang này không tồn tại" })).toBeVisible();
  await expect(reader.page.getByText("Báo cáo đang mở")).toHaveCount(0);
  const moderator = await person(browser, "Kiểm duyệt viên");
  await makeAdmin(moderator.email);
  await moderator.page.goto("/admin");
  const report = moderator.page.getByRole("listitem").filter({ hasText: title });
  await expect(report).toBeVisible();
  await report.getByRole("button", { name: "Ẩn bộ thẻ" }).click();
  await expect(moderator.page.getByText("Đã xử lý.")).toBeVisible();
  await expect(report).toHaveCount(0);

  const guest = await (await browser.newContext()).newPage();
  expect((await guest.goto(`/s/${slug}`))?.status()).toBe(404);
  // The owner is told why their set is no longer reachable.
  await owner.page.goto(`/sets/${id}`);
  await owner.page.getByRole("button", { name: /Chia sẻ/ }).click();
  await expect(owner.page.getByText(/Quản trị viên đã ẩn bộ thẻ này/)).toBeVisible();
});

test("publishing a clean set earns credits, and so does being copied", async ({ browser }) => {
  test.skip(process.env.E2E_AI_LIVE !== "1", "Calls the live moderation model");
  const owner = await person(browser, "Người đóng góp");
  const id = await createSet(owner.page, owner.headers, "Từ vựng nhà bếp công khai");
  const shared = await share(owner.page, owner.headers, id, "public");
  expect(["approved", "pending"]).toContain(shared.moderationStatus);
  test.skip(shared.moderationStatus !== "approved", "Moderation model is busy; checked later");
  const quota = async () => (await (await owner.page.request.get("/api/v1/ai/quota")).json()).data;
  expect((await quota()).earned).toBe(5);
  const reader = await person(browser, "Người học");
  const copied = await reader.page.request.post(`/api/v1/public/${shared.slug}/copy`, {
    headers: reader.headers,
    data: {},
  });
  expect(copied.ok()).toBeTruthy();
  expect((await quota()).earned).toBe(6);
});
