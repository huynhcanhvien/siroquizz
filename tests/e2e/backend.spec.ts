import { expect, test } from "@playwright/test";
import { emailLink, findSet, registerUser, TEST_PASSWORD } from "./fixtures";

test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Requires HTTP backend and Mailpit");

test("syncs a verified account between two independent browsers", async ({
  page,
  browser,
  baseURL,
}) => {
  const email = await registerUser(page);
  const set = await findSet(page, "HSK");
  const second = await browser.newContext({ baseURL });
  try {
    const tab = await second.newPage();
    await tab.goto("/login");
    await tab.getByLabel("Email").fill(email);
    await tab.getByLabel("Mật khẩu", { exact: true }).fill(TEST_PASSWORD);
    await tab.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(tab).toHaveURL(/\/home$/);
    await tab.goto(`/sets/${set.id}`);
    await expect(tab.getByRole("heading", { level: 1 })).toContainText("HSK");
    const response = await tab.request.get(`/api/v1/sets/${set.id}`);
    expect(response.ok()).toBeTruthy();
  } finally {
    await second.close();
  }
});

test("resets passwords through email and rejects token reuse", async ({ page, baseURL }) => {
  const email = await registerUser(page);
  await page.context().clearCookies();
  await page.goto("/forgot-password");

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
  const link = await emailLink(page, email, "reset-password");
  await page.goto(link);
  const token = new URL(page.url()).searchParams.get("token");
  expect(token).toBeTruthy();
  await page.getByLabel("Mật khẩu", { exact: true }).fill("matkhau2026Moi");
  await page.getByLabel("Nhập lại mật khẩu").fill("matkhau2026Moi");
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã đổi mật khẩu" })).toBeVisible();
  const response = await page.request.post("/api/auth/reset-password", {
    headers: { Origin: baseURL! },
    data: { token, newPassword: "matkhau2026Khac" },
  });
  expect(response.status()).toBe(400);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("matkhau2026Moi");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("rejects cross-origin writes and data access by another account", async ({
  page,
  browser,
  baseURL,
}) => {
  await registerUser(page);
  const set = await findSet(page, "HSK");
  const blocked = await page.request.delete(`/api/v1/sets/${set.id}`, {
    headers: { Origin: "https://untrusted.example" },
  });
  expect(blocked.status()).toBe(403);
  const second = await browser.newContext({ baseURL });
  try {
    const tab = await second.newPage();
    await registerUser(tab, "Người Khác");
    expect((await tab.request.get(`/api/v1/sets/${set.id}`)).status()).toBe(404);
    expect((await tab.request.get(`/api/v1/sets/${set.id}/progress`)).status()).toBe(404);
  } finally {
    await second.close();
  }
});

test("imports local sets and progress, then removes only acknowledged device records", async ({
  page,
}) => {
  const email = await registerUser(page);
  const oldSetId = crypto.randomUUID(),
    oldCardId = crypto.randomUUID();
  await page.evaluate(
    ({ email, oldSetId, oldCardId }) => {
      const timestamp = new Date().toISOString();
      localStorage.setItem(
        "siroquizz:v1:accounts",
        JSON.stringify([
          {
            id: "old-user",
            email,
            displayName: "Old User",
            avatarColor: "indigo",
            uiLocale: "vi",
            createdAt: timestamp,
            passwordHash: "mock-only",
          },
        ]),
      );
      localStorage.setItem(
        "siroquizz:v1:sets",
        JSON.stringify([
          {
            id: oldSetId,
            ownerId: "old-user",
            title: "Bộ thẻ từ thiết bị",
            description: "",
            termLang: "en",
            definitionLang: "vi",
            source: "manual",
            createdAt: timestamp,
            updatedAt: timestamp,
            cards: [
              { id: oldCardId, term: "hello", definition: "xin chào" },
              { id: "second", term: "thanks", definition: "cảm ơn" },
            ],
          },
        ]),
      );
      localStorage.setItem(
        "siroquizz:v1:progress",
        JSON.stringify([
          {
            userId: "old-user",
            setId: oldSetId,
            cardId: oldCardId,
            status: "known",
            updatedAt: timestamp,
          },
        ]),
      );
    },
    { email, oldSetId, oldCardId },
  );
  await page.reload();
  await page.getByRole("button", { name: "Nhập dữ liệu thiết bị", exact: true }).click();
  await expect(page.getByText("Đã nhập dữ liệu thiết bị.", { exact: true })).toBeVisible();
  const set = await findSet(page, "Bộ thẻ từ thiết bị");
  expect(set.id).not.toBe(oldSetId);
  const progress = await (await page.request.get(`/api/v1/sets/${set.id}/progress`)).json();
  expect(progress.data[0]).toMatchObject({ cardId: set.cards[0].id, status: "known" });
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("siroquizz:v1:sets") ?? "[]")),
  ).toHaveLength(0);
});

test("enforces login attempt limits with a friendly 429 response", async ({ page, baseURL }) => {
  const email = await registerUser(page);
  await page.context().clearCookies();
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await page.request.post("/api/auth/sign-in/email", {
      headers: { Origin: baseURL! },
      data: { email, password: "wrong12345" },
    });
    expect(result.status()).toBe(401);
  }
  const blocked = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL! },
    data: { email, password: TEST_PASSWORD },
  });
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("changes a password, keeps the current session and soft-deletes the account", async ({
  page,
  baseURL,
}) => {
  await registerUser(page);
  await page.goto("/settings");
  await page.getByLabel("Mật khẩu hiện tại", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("matkhauMoi2026");
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await expect(
    page.getByText("Đã đổi mật khẩu và đăng xuất các phiên khác.", { exact: true }),
  ).toBeVisible();
  const deleted = await page.request.delete("/api/v1/me", {
    headers: { Origin: baseURL! },
    data: { password: "matkhauMoi2026" },
  });
  expect(deleted.status()).toBe(200);
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});
