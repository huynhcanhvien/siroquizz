import { RepositoryError } from "@/lib/repository-error";
import { MAX_DOCUMENT_TOKENS } from "../lib/document-limits";
import { estimateTokens } from "../lib/output";
import type * as PdfJs from "pdfjs-dist";
import type { LangCode } from "@/lib/types";
import { getFileMime } from "../lib/file-validation";
import type { OcrRequest, OcrResponse } from "./ocr.worker";
import type { RgbaImage } from "./ppocr";

/**
 * Reads scanned PDFs and photos on the user's device: PDF.js renders the pages and PP-OCRv4 (in
 * a worker) reads them. The text goes to the server instead of the scan, so reading costs no AI
 * credits and does not wait in the shared AI queue. Anything this cannot read is sent as it is,
 * for the server to read.
 */

/** The PP-OCRv4 Chinese model also reads Latin letters, but not accents, kana or hangul. */
const BROWSER_OCR_LANGUAGES: ReadonlySet<LangCode> = new Set(["zh", "en"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** Pages are rendered at twice PDF size: an A4 page becomes about 1190 × 1680 pixels. */
const PDF_RENDER_SCALE = 2;
/** Photos are scaled down to this longest side; more pixels only slow OCR down. */
const IMAGE_MAX_SIDE = 2000;
/** A page with less text than this in its text layer is a scan. */
const MIN_PAGE_TEXT = 4;

export interface LocalReadProgress {
  completed: number;
  total: number;
}

export const canReadLocally = (termLang: LangCode) =>
  BROWSER_OCR_LANGUAGES.has(termLang) &&
  typeof Worker !== "undefined" &&
  typeof WebAssembly !== "undefined";

type PdfModule = typeof PdfJs;
let pdfjs: Promise<PdfModule> | null = null;
function loadPdfJs() {
  pdfjs ??= (async () => {
    const url = "/vendor/pdfjs/pdf.min.mjs";
    const pdfModule = (await import(/* webpackIgnore: true */ url)) as PdfModule;
    pdfModule.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    return pdfModule;
  })();
  return pdfjs;
}

/** One OCR worker, created on first use and kept for later requests. */
let worker: Worker | null = null;
let nextRequest = 0;
function ocrImage(image: RgbaImage, signal: AbortSignal) {
  signal.throwIfAborted();
  worker ??= new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" });
  const id = ++nextRequest;
  const current = worker;
  return new Promise<string>((resolve, reject) => {
    const done = () => {
      current.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
    };
    const onMessage = ({ data }: MessageEvent<OcrResponse>) => {
      if (data.id !== id) return;
      done();
      if ("error" in data) reject(new Error(data.error));
      else resolve(data.text);
    };
    const onAbort = () => {
      done();
      // The page being read cannot be interrupted; a fresh worker serves the next request.
      current.terminate();
      if (worker === current) worker = null;
      reject(signal.reason);
    };
    current.addEventListener("message", onMessage);
    signal.addEventListener("abort", onAbort, { once: true });
    current.postMessage({ id, image } satisfies OcrRequest, [image.data.buffer]);
  });
}

function pixelsOf(canvas: HTMLCanvasElement): RgbaImage {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  return { data, width, height };
}

async function imagePixels(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  // OCR expects dark text on white; transparent PNGs would otherwise read as black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return pixelsOf(canvas);
}

type PageText = (pdfPage: PdfJs.PDFPageProxy) => Promise<string>;
const textLayerOf: PageText = async (page) =>
  (await page.getTextContent()).items
    .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
    .join("");

async function renderPage(page: PdfJs.PDFPageProxy): Promise<RgbaImage> {
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return pixelsOf(canvas);
}

const textFile = (source: File, text: string) =>
  new File([text], `${source.name.replace(/\.[^.]+$/, "")}.txt`, { type: "text/plain" });

/** Reads files sequentially so only one PDF and one rendered page occupy memory. */
export async function readScansLocally(
  files: readonly File[],
  onProgress: (progress: LocalReadProgress) => void,
  signal: AbortSignal,
): Promise<File[]> {
  const result: File[] = [];
  let usedTokens = 0;
  let completed = 0;
  let total = files.length;
  const check = (text: string) => {
    if (usedTokens + estimateTokens(text) > MAX_DOCUMENT_TOKENS)
      throw new RepositoryError("DOCUMENT_TOO_LONG");
  };
  for (const file of files) {
    signal.throwIfAborted();
    const mime = getFileMime(file);
    try {
      let text: string;
      if (IMAGE_MIMES.has(mime)) {
        text = await ocrImage(await imagePixels(file), signal);
        onProgress({ completed: ++completed, total });
      } else if (mime === "application/pdf") {
        const task = (await loadPdfJs()).getDocument({ data: await file.arrayBuffer() });
        try {
          const pdf = await task.promise;
          total += pdf.numPages - 1;
          onProgress({ completed, total });
          const texts: string[] = [];
          for (let number = 1; number <= pdf.numPages; number++) {
            signal.throwIfAborted();
            const page = await pdf.getPage(number);
            try {
              const layer = await textLayerOf(page);
              texts.push(
                layer.trim().length >= MIN_PAGE_TEXT
                  ? layer
                  : await ocrImage(await renderPage(page), signal),
              );
              check(texts.join("\n\n"));
              onProgress({ completed: ++completed, total });
            } finally {
              page.cleanup();
            }
          }
          text = texts.join("\n\n");
        } finally {
          await task.destroy();
        }
      } else if (["text/plain", "text/markdown", "text/x-markdown", "text/csv"].includes(mime)) {
        // Encoding is detected by the server; preserve original bytes.
        result.push(file);
        continue;
      } else {
        result.push(file);
        continue;
      }
      check(text);
      usedTokens += estimateTokens(text);
      result.push(text.trim() ? textFile(file, text) : file);
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof RepositoryError && error.code === "DOCUMENT_TOO_LONG")
      )
        throw error;
      // Unsupported devices may still use the bounded server OCR fallback.
      result.push(file);
    }
  }
  return result;
}
