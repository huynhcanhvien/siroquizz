import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { extractDocument, validateMagic, countPdfPages } from "@/server/ai/extract";
import {
  presignUpload,
  verifyUploadSignature,
  readBinary,
  putLocalFile,
  getUpload,
  deleteUpload,
} from "@/server/ai/storage";
import { v7 } from "uuid";
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({ NODE_ENV: "test", BETTER_AUTH_SECRET: "a".repeat(64) }),
}));
vi.mock("@/server/ai/groq", () => ({
  groqJson: vi.fn(async () => ({
    data: { text: "cat - mèo\ndog - chó" },
    usage: { input: 10, output: 10, cached: 0, cost: 0.00001 },
  })),
}));
it("extracts real TXT, DOCX and a 10-page Chinese PDF", async () => {
  for (const [file, mime, term] of [
    ["1-vocabulary.txt", "text/plain", "cat"],
    [
      "technical.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "cat",
    ],
    ["chinese-10-pages.pdf", "application/pdf", "北京"],
  ]) {
    const result = await extractDocument(
      await readFile(`evals/ai-generation/${file}`),
      file,
      mime,
      new AbortController().signal,
    );
    expect(result.text).toContain(term);
    if (file.endsWith("pdf")) expect(result.pages).toBe(10);
  }
});
it("extracts image text after bounded pixel decoding", async () => {
  const result = await extractDocument(
    await readFile("evals/ai-generation/english-table.png"),
    "table.png",
    "image/png",
    new AbortController().signal,
  );
  expect(result.text).toContain("cat");
  expect(result.usage.input).toBe(10);
});
it("decodes text exports from Notepad and Excel in their native encodings", async () => {
  const signal = new AbortController().signal;
  const utf8Bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("cat,mèo")]);
  const utf16le = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from("cat\tmèo\n北京", "utf16le"),
  ]);
  const utf16be = Buffer.from(
    Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("dog - chó", "utf16le").swap16()]),
  );
  // "mèo" in Windows-1258, as Excel writes CSV on Vietnamese Windows.
  const cp1258 = Buffer.from([0x63, 0x61, 0x74, 0x2c, 0x6d, 0xe8, 0x6f]);
  expect((await extractDocument(utf8Bom, "a.csv", "text/csv", signal)).text).toBe("cat,mèo");
  expect((await extractDocument(utf16le, "a.txt", "text/plain", signal)).text).toBe(
    "cat\tmèo\n北京",
  );
  expect((await extractDocument(utf16be, "a.md", "text/markdown", signal)).text).toBe("dog - chó");
  expect((await extractDocument(cp1258, "a.csv", "application/vnd.ms-excel", signal)).text).toBe(
    "cat,mèo",
  );
});
it("rejects spoofed files, binary text and malformed DOCX", async () => {
  expect(() => validateMagic(Buffer.from("exe"), "document.pdf", "application/pdf")).toThrow();
  expect(() => validateMagic(Buffer.from([0, 1, 2]), "a.txt", "text/plain")).toThrow();
  await expect(
    extractDocument(
      Buffer.from([0x01, 0x02, 0xff]),
      "a.txt",
      "text/plain",
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await expect(
    extractDocument(
      Buffer.from("PKfake"),
      "a.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
});
it("rejects empty and excessively long documents", async () => {
  await expect(
    extractDocument(Buffer.from("  "), "a.txt", "text/plain", new AbortController().signal),
  ).rejects.toMatchObject({ code: "EMPTY_DOCUMENT" });
  await expect(
    extractDocument(
      Buffer.from("x".repeat(180001)),
      "a.txt",
      "text/plain",
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "DOCUMENT_TOO_LONG" });
});
it("rejects PDFs above the free 30-page limit before extraction", async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 31; i++) pdf.addPage();
  await expect(
    extractDocument(
      Buffer.from(await pdf.save()),
      "a.pdf",
      "application/pdf",
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "PDF_PAGE_LIMIT" });
});
it("signs local uploads, prevents tampering, expiry, replay and path traversal", async () => {
  const id = v7(),
    key = `uploads/${id}`,
    bytes = Buffer.from("cat - mèo\ndog - chó");
  const url = await presignUpload(id, key, bytes.length, "text/plain");
  const query = new URL(url, "http://localhost").searchParams;
  expect(() => verifyUploadSignature(id, bytes.length, "text/plain", query)).not.toThrow();
  expect(() => verifyUploadSignature(id, bytes.length + 1, "text/plain", query)).toThrow();
  const expired = new URLSearchParams(query);
  expired.set("expires", "1");
  expect(() => verifyUploadSignature(id, bytes.length, "text/plain", expired)).toThrow();
  await putLocalFile(key, bytes);
  expect(await getUpload(key, bytes.length)).toEqual(bytes);
  await expect(putLocalFile(key, bytes)).rejects.toMatchObject({ status: 409 });
  await expect(getUpload(key, bytes.length + 1)).rejects.toMatchObject({ code: "INVALID_FILE" });
  await expect(getUpload("uploads/../../secret", bytes.length)).rejects.toThrow();
  await deleteUpload(key);
  await expect(getUpload(key, bytes.length)).rejects.toMatchObject({ code: "UPLOAD_MISSING" });
});
it("checks actual streamed payload size rather than trusting Content-Length", async () => {
  expect(await readBinary(new Request("http://local", { method: "PUT", body: "123" }), 3)).toEqual(
    Buffer.from("123"),
  );
  await expect(
    readBinary(new Request("http://local", { method: "PUT", body: "1234" }), 3),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readBinary(new Request("http://local", { method: "PUT", body: "12" }), 3),
  ).rejects.toMatchObject({ status: 400 });
});

it("renders an actual scanned PDF and uses OCR only after bounded page inspection", async () => {
  const pdf = await PDFDocument.create(),
    bytes = await readFile("evals/ai-generation/english-table.png");
  const image = await pdf.embedPng(bytes),
    page = pdf.addPage([600, 800]);
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 700 });
  const file = Buffer.from(await pdf.save());
  expect(await countPdfPages(file)).toBe(1);
  const result = await extractDocument(
    file,
    "scan.pdf",
    "application/pdf",
    new AbortController().signal,
  );
  expect(result.text).toContain("cat");
  expect(result.usage.input).toBe(10);
});
