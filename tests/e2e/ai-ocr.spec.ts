import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
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

// Exercise all 100 rendered pages deterministically; the test above verifies the real OCR model.
test("reads every page of a 100-page scan and limits the saved preview to 200 cards", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(await readFile("tests/fixtures/ocr-sample.png"));
  for (let i = 0; i < 100; i++)
    pdf.addPage([595, 842]).drawImage(image, { x: 40, y: 150, width: 515, height: 590 });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let readPages = 0;
    window.Worker = class extends EventTarget {
      constructor(url: string | URL, options?: WorkerOptions) {
        super();
        if (String(url).includes("pdf.worker")) return new NativeWorker(url, options);
      }
      postMessage(data: { id: number }) {
        const start = readPages++ * 20;
        const text = Array.from(
          { length: 20 },
          (_, i) => `word${start + i} - meaning${start + i}`,
        ).join("\n");
        queueMicrotask(() =>
          this.dispatchEvent(new MessageEvent("message", { data: { id: data.id, text } })),
        );
      }
      terminate() {}
    } as unknown as typeof Worker;
    const send = window.fetch.bind(window);
    Object.assign(window, { documentUploads: [] as string[] });
    window.fetch = async (input, init) => {
      if (init?.method === "PUT" && init.body instanceof Blob)
        (window as unknown as { documentUploads: string[] }).documentUploads.push(
          await init.body.text(),
        );
      return send(input, init);
    };
  });
  await registerUser(page);
  await page.goto("/sets/new/ai");
  await page.getByLabel("Ngôn ngữ thuật ngữ").selectOption("en");
  await page.getByLabel("Số thẻ").fill("200");
  await page
    .getByLabel("Chọn tệp")
    .setInputFiles({
      name: "100-pages.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByRole("button", { name: "Tạo thẻ" }).click();
  await expect(page.getByRole("heading", { name: "Xem lại và chỉnh sửa" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText("Đã chọn 200/200")).toBeVisible();
  const text = await page.evaluate(() =>
    (window as unknown as { documentUploads: string[] }).documentUploads.join(""),
  );
  expect(text).toContain("word0 - meaning0");
  expect(text).toContain("word1999 - meaning1999");
  await page.getByRole("button", { name: "Lưu 200 thẻ" }).click();
  await expect(page.getByRole("heading", { name: "Thuật ngữ trong bộ này (200)" })).toBeVisible();
});
