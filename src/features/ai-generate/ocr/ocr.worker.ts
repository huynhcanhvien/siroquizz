/// <reference lib="webworker" />
/**
 * Runs PP-OCRv4 off the main thread. ONNX Runtime Web and the models are static files under
 * /vendor (see scripts/copy-browser-ocr-assets.mjs), loaded on the first page and reused.
 */
import type * as Ort from "onnxruntime-web";
import { recognizePage, type RgbaImage, type RunModel } from "./ppocr";

const VENDOR = "/vendor";
export interface OcrRequest {
  id: number;
  image: RgbaImage;
}
export type OcrResponse = { id: number; text: string } | { id: number; error: string };

let engine: Promise<{ run: RunModel; characters: string[] }> | null = null;

async function loadEngine() {
  // A plain URL import: the runtime is served as-is rather than bundled.
  const runtimeUrl = `${VENDOR}/ort/ort.wasm.min.mjs`;
  const ort = (await import(/* webpackIgnore: true */ runtimeUrl)) as typeof Ort;
  ort.env.wasm.wasmPaths = `${VENDOR}/ort/`;
  // Threads need cross-origin isolation, which the site does not enable.
  ort.env.wasm.numThreads = 1;
  const [det, rec, keys] = await Promise.all([
    ort.InferenceSession.create(`${VENDOR}/ocr/det.onnx`),
    ort.InferenceSession.create(`${VENDOR}/ocr/rec.onnx`),
    fetch(`${VENDOR}/ocr/keys.txt`).then((response) => {
      if (!response.ok) throw new Error(`OCR dictionary unavailable (${response.status})`);
      return response.text();
    }),
  ]);
  const run: RunModel = async (model, input, dims) => {
    const session = model === "det" ? det : rec;
    const outputs = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", input, dims),
    });
    const output = outputs[session.outputNames[0]];
    return { data: output.data as Float32Array, dims: output.dims };
  };
  return { run, characters: keys.split(/\r?\n/).filter(Boolean) };
}

self.onmessage = async ({ data }: MessageEvent<OcrRequest>) => {
  try {
    engine ??= loadEngine();
    const { run, characters } = await engine;
    const text = await recognizePage(data.image, run, characters);
    self.postMessage({ id: data.id, text } satisfies OcrResponse);
  } catch (error) {
    // A failed load is retried with the next page.
    engine = null;
    self.postMessage({ id: data.id, error: String(error) } satisfies OcrResponse);
  }
};
