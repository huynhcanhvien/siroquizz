import { expect, test, type Page } from "@playwright/test";
import { registerUser } from "./fixtures";

/** Drives a job the way the browser client does: repeated POST /step until it finishes. */
async function driveToEnd(page: Page, jobId: string, headers: Record<string, string>) {
  for (let i = 0; i < 50; i++) {
    const res = await page.request.post(`/api/v1/ai/jobs/${jobId}/step`, { headers, data: {} });
    expect(res.ok()).toBeTruthy();
    const step = (await res.json()).data;
    if (["done", "error", "cancelled"].includes(step.status)) return step;
    // Queued behind other jobs or throttled: wait as the real client does.
    if (step.retryAfterMs) await page.waitForTimeout(step.retryAfterMs);
  }
  throw new Error("job did not finish");
}
test("validates uploaded bytes, persists generations and enforces successful-job quota", async ({
  page,
}) => {
  await registerUser(page);
  const origin = new URL(page.url()).origin,
    headers = { Origin: origin };
  const content = "cat - mèo\ndog - chó\nbird - chim\nfish - cá\nbook - sách";
  const response = await page.request.post("/api/v1/ai/uploads", {
    headers,
    data: { name: "animals.txt", mime: "text/plain", size: Buffer.byteLength(content) },
  });
  expect(response.ok()).toBeTruthy();
  const upload = (await response.json()).data;
  expect(
    (
      await page.request.put(upload.url, {
        headers: { ...headers, "Content-Type": "text/plain" },
        data: content,
      })
    ).ok(),
  ).toBeTruthy();
  const spoof = await page.request.post("/api/v1/ai/uploads", {
    headers,
    data: { name: "evil.pdf", mime: "application/pdf", size: 3 },
  });
  const bad = (await spoof.json()).data;
  expect(
    (
      await page.request.put(bad.url, {
        headers: { ...headers, "Content-Type": "application/pdf" },
        data: "exe",
      })
    ).status(),
  ).toBe(400);
  const options = { cardCount: 5, termLang: "en", definitionLang: "vi", includePhonetic: false };
  for (let i = 0; i < 5; i++) {
    const created = await page.request.post("/api/v1/ai/jobs", {
      headers,
      data: { uploadIds: [upload.uploadId], prompt: "", options },
    });
    expect(created.ok()).toBeTruthy();
    const { jobId } = (await created.json()).data;
    const final = await driveToEnd(page, jobId, headers);
    expect(final.status).toBe("done");
    expect(final.result?.cards.length).toBeGreaterThanOrEqual(2);
  }
  const quota = (await (await page.request.get("/api/v1/ai/quota")).json()).data;
  expect(quota.remaining).toBe(0);
  expect(quota.resetsAt).toMatch(/T17:00:00/);
  expect(
    (
      await page.request.post("/api/v1/ai/jobs", {
        headers,
        data: { uploadIds: [], prompt: "animals", options },
      })
    ).status(),
  ).toBe(429);
  await page.goto("/sets/new/ai");
  await expect(page.getByText("Các lần tạo trong 24 giờ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mở lại" })).toHaveCount(5);
  await page.getByRole("button", { name: "Mở lại" }).first().click();
  await expect(page.getByText("Đã chọn 5/5")).toBeVisible();
});
test("a cancelled or foreign job cannot be streamed or charged", async ({ page, browser }) => {
  await registerUser(page);
  const origin = new URL(page.url()).origin,
    headers = { Origin: origin };
  const options = { cardCount: 5, termLang: "en", definitionLang: "vi", includePhonetic: false };
  const response = await page.request.post("/api/v1/ai/jobs", {
    headers,
    data: { uploadIds: [], prompt: "animals", options },
  });
  const { jobId } = (await response.json()).data;
  await page.request.post(`/api/v1/ai/jobs/${jobId}/cancel`, { headers, data: {} });
  const cancelledStep = (
    await (await page.request.post(`/api/v1/ai/jobs/${jobId}/step`, { headers, data: {} })).json()
  ).data;
  expect(cancelledStep.status).toBe("cancelled");
  expect(cancelledStep.errorCode).toBe("AI_CANCELLED");
  expect((await (await page.request.get("/api/v1/ai/quota")).json()).data.remaining).toBe(5);
  const other = await browser.newContext(),
    second = await other.newPage();
  await registerUser(second);
  const headers2 = { Origin: new URL(second.url()).origin };
  expect(
    (await second.request.post(`/api/v1/ai/jobs/${jobId}/step`, { headers: headers2, data: {} })).status(),
  ).toBe(404);
  await other.close();
});
test("live Groq generation returns Chinese pinyin and saves a set", async ({ page }) => {
  test.skip(
    process.env.E2E_AI_LIVE !== "1",
    "Live provider eval is opt-in and requires a server key",
  );
  await registerUser(page);
  await page.goto("/sets/new/ai");
  await page
    .getByRole("textbox", { name: "Yêu cầu cho AI" })
    .fill("Create 5 Chinese HSK2 words with pinyin and Vietnamese meanings.");
  await page.locator("select").first().selectOption("zh");
  await page.locator('input[type="range"]').fill("5");
  await page.getByRole("button", { name: "Tạo thẻ" }).click();
  await expect(page.getByRole("heading", { name: "Xem lại và chỉnh sửa" })).toBeVisible({
    timeout: 180000,
  });
  await expect(page.getByText("Đã chọn 5/5")).toBeVisible();
  await page.getByRole("button", { name: "Lưu 5 thẻ" }).click();
  await expect(page.getByRole("heading", { name: "Thuật ngữ trong bộ này (5)" })).toBeVisible();
});
