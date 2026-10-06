import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { registerUser } from "./fixtures";

test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Admin requires the HTTP backend");
test.describe.configure({ timeout: 180_000 });

async function promote(email: string) {
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [user] = await db`update "user" set role = 'admin' where email = ${email} returning id`;
    return user.id as string;
  } finally {
    await db.end();
  }
}
const routes = [
  ["/admin", "Tổng quan"],
  ["/admin/moderation", "Kiểm duyệt"],
  ["/admin/users", "Người dùng"],
  ["/admin/ai", "AI & credit"],
  ["/admin/sets", "Bộ thẻ"],
  ["/admin/audit", "Nhật ký"],
] as const;

test("admin navigates all pages, bans/unbans, grants/revokes and adjusts credits with audit", async ({
  page,
  browser,
}) => {
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const email = await registerUser(memberPage, "Người dùng quản trị thử");
  const member = (await (await memberPage.request.get("/api/v1/me")).json()).data;
  const id = member.id as string;
  try {
    await memberPage.goto("/admin/users");
    await expect(
      memberPage.getByRole("heading", { name: "Trang này không tồn tại" }),
    ).toBeVisible();
    expect((await memberPage.request.get("/api/v1/admin/users")).status()).toBe(403);
    const adminEmail = await registerUser(page, "Admin thử");
    await promote(adminEmail);
    for (const [path, name] of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Menu quản trị" })
          .getByRole("link", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    }
    await page.goto("/admin/users");
    await page.getByLabel("Tìm kiếm").fill(email);
    await page.getByRole("button", { name: "Lọc", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`q=${encodeURIComponent(email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    await page.getByRole("link", { name: "Người dùng quản trị thử", exact: true }).click();
    await expect(page).toHaveURL(`/admin/users/${id}`);
    await page.getByRole("button", { name: "Khóa tài khoản", exact: true }).click();
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mở khóa", exact: true })).toBeVisible();
    expect((await memberPage.request.get("/api/v1/admin/overview")).status()).toBe(403);
    await page.getByRole("button", { name: "Mở khóa", exact: true }).click();
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByRole("button", { name: "Khóa tài khoản", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cấp quyền admin", exact: true }).click();
    await expect(page.getByText(/Tài khoản này sẽ có toàn quyền/)).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByRole("button", { name: "Thu quyền admin", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Thu quyền admin", exact: true }).click();
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cấp quyền admin", exact: true })).toBeVisible();
    for (const delta of [25, -5]) {
      await page.getByRole("button", { name: "Điều chỉnh credit", exact: true }).click();
      await page.getByLabel("Số credit cộng/trừ").fill(String(delta));
      await page.getByLabel("Ghi chú", { exact: true }).fill("E2E admin support");
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const detail = (await (await page.request.get(`/api/v1/admin/users/${id}`)).json()).data;
    expect(detail.credits.earned).toBe(20);
    await page.goto(`/admin/audit?targetId=${id}`);
    await expect(page.getByRole("table")).toContainText("credit_adjust");
    const log = (await (await page.request.get(`/api/v1/admin/audit?targetId=${id}`)).json()).data
      .items;
    expect(log.map((item: { action: string }) => item.action).sort()).toEqual(
      [
        "credit_adjust",
        "credit_adjust",
        "user_ban",
        "user_grant_admin",
        "user_revoke_admin",
        "user_unban",
      ].sort(),
    );
  } finally {
    await memberContext.close();
  }
});

test("admin pages and details pass axe and fit 320/768/1440 in light and dark themes", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const email = await registerUser(page, "Admin chất lượng");
  const id = await promote(email);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.emulateMedia({ colorScheme: theme as "light" | "dark", reducedMotion: "reduce" });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, name] of [...routes, [`/admin/users/${id}`, "Chi tiết người dùng"]]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
          `${path} ${width} ${theme}`,
        ).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          results.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          `${path} ${width} ${theme}`,
        ).toEqual([]);
      }
    }
  }
});

test("admin cancels queued jobs and hides/restores sets with history", async ({ page }) => {
  const email = await registerUser(page, "Admin nội dung");
  const adminId = await promote(email);
  const sets = (await (await page.request.get("/api/v1/sets?limit=50")).json()).data;
  const set = sets[0];
  const headers = { Origin: new URL(page.url()).origin };
  expect(
    (
      await page.request.patch(`/api/v1/sets/${set.id}/visibility`, {
        headers,
        data: { visibility: "unlisted" },
      })
    ).ok(),
  ).toBeTruthy();
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  let jobId: string;
  let ownerId: string;
  try {
    const { randomUUID } = await import("node:crypto");
    jobId = randomUUID();
    // Another person's job: the admin's own open jobs would be resumed by their browser.
    ownerId = randomUUID();
    await db`insert into "user" (id, name, email) values (${ownerId}, 'Chủ job', ${`job-${ownerId}@example.com`})`;
    await db`insert into ai_generation_jobs (id, user_id, status, prompt, options, upload_ids) values (${jobId}, ${ownerId}, 'queued', 'E2E cancel admin job', ${db.json({ cardCount: 5, termLang: "en", definitionLang: "vi", includePhonetic: false })}, '[]'::jsonb)`;
  } finally {
    await db.end();
  }
  await page.goto(`/admin/ai?status=active&userId=${ownerId}`);
  await expect(page.getByRole("table")).toContainText("E2E cancel admin job");
  await page.getByRole("button", { name: "Hủy job", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  // The dialog hides the page from the accessibility tree, so wait for the result, not the table.
  await expect(page.getByText("Đã xử lý.")).toBeVisible();
  await expect(page.getByText("Không có mục nào.")).toBeVisible();
  const jobs = (await (await page.request.get(`/api/v1/admin/jobs?userId=${ownerId}`)).json()).data
    .items;
  expect(jobs.find((job: { id: string }) => job.id === jobId).status).toBe("cancelled");
  await page.goto(`/admin/sets?q=${encodeURIComponent(set.title)}`);
  const row = page
    .getByRole("row")
    .filter({ hasText: set.title })
    // Earlier runs leave same-named sets by same-named admins; the owner link is unique.
    .filter({ has: page.locator(`a[href="/admin/users/${adminId}"]`) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Ẩn bộ thẻ", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(row.getByRole("button", { name: "Khôi phục", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Khôi phục", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(row.getByRole("button", { name: "Ẩn bộ thẻ", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Lịch sử kiểm duyệt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("set_hide");
  await expect(dialog).toContainText("set_restore");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("button", { name: /Ngôn ngữ/ }).click();
  await page.getByRole("menuitemradio", { name: "中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("卡组");
  await page.getByRole("button", { name: /语言/ }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sets");
});
