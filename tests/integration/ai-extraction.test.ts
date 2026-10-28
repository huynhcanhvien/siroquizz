import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  countPdfPages,
  extractDocument,
  extractPdfPages,
  inspectPdf,
  validateMagic,
} from "@/server/ai/extract";
import { estimateTokens } from "@/features/ai-generate/lib/output";
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
      Buffer.from("x".repeat(250001)),
      "a.txt",
      "text/plain",
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "DOCUMENT_TOO_LONG" });
});
it("reads all 100 PDF pages with 20 vocabulary entries per page", async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 100; i++) {
    const page = pdf.addPage();
    for (let row = 0; row < 20; row++)
      page.drawText(`word${i * 20 + row} definition of vocabulary`, {
        x: 40,
        y: 800 - row * 30,
        size: 12,
      });
  }
  const result = await extractDocument(
    Buffer.from(await pdf.save()),
    "a.pdf",
    "application/pdf",
    new AbortController().signal,
  );
  expect(result.pages).toBe(100);
  expect(result.ocrPages).toBe(0);
  expect(result.text).toContain("word0 ");
  expect(result.text).toContain("word1999 ");
});
/** A PDF whose pages are text ("t") or a blank scan-like page with no text layer ("s"). */
async function pdfOf(kinds: string) {
  const pdf = await PDFDocument.create();
  [...kinds].forEach((kind, i) => {
    const page = pdf.addPage([600, 800]);
    if (kind === "t")
      for (let row = 0; row < 10; row++)
        page.drawText(`page${i} word${row} definition`, { x: 40, y: 760 - row * 30, size: 12 });
  });
  return Buffer.from(await pdf.save());
}
const signal = () => new AbortController().signal;
it("reads every text page in one call and batches only scanned pages for OCR", async () => {
  const text = await extractPdfPages(await pdfOf("t".repeat(60)), 1, 6, signal());
  expect(text).toMatchObject({ nextPage: 0, totalPages: 60, ocrPages: 0 });
  expect(text.text).toContain("page59 word9");
  expect(text.tokens).toBeGreaterThanOrEqual(estimateTokens(text.text));
  const mixed = await pdfOf("tsst");
  const first = await extractPdfPages(mixed, 1, 1, signal());
  expect(first).toMatchObject({ nextPage: 3, ocrPages: 1 });
  expect(first.text).toContain("page0 word0");
  const rest = await extractPdfPages(mixed, 3, 1, signal());
  expect(rest).toMatchObject({ nextPage: 0, ocrPages: 1 });
  expect(rest.text).toContain("page3 word0");
});
it("stops reading pages near the deadline but always makes progress", async () => {
  const bytes = await pdfOf("tttt");
  const range = await extractPdfPages(bytes, 1, 6, signal(), Date.now() + 1);
  expect(range).toMatchObject({ nextPage: 2, retryAfterMs: 0 });
  expect(range.text).toContain("page0 word0");
  expect(range.text).not.toContain("page1 word0");
  await expect(inspectPdf(await pdfOf("tsts"), 1, Date.now() + 1)).resolves.toEqual({
    pages: 4,
    scannedPages: 0,
    nextPage: 2,
  });
  await expect(inspectPdf(await pdfOf("tsts"), 2)).resolves.toEqual({
    pages: 4,
    scannedPages: 2,
    nextPage: 0,
  });
});
it("refuses a PDF over the remaining document budget while reading it", async () => {
  await expect(
    extractPdfPages(await pdfOf("tttt"), 1, 6, signal(), undefined, 20),
  ).rejects.toMatchObject({ code: "DOCUMENT_TOO_LONG" });
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
