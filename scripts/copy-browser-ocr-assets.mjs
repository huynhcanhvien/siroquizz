// Copies the in-browser OCR runtime (ONNX Runtime Web, PDF.js) and the PP-OCRv4 models from
// node_modules into public/vendor, so Vercel serves them as static files. Runs after install
// and before dev/build; the copies are not committed.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const target = join(root, "public", "vendor");
const files = [
  ["onnxruntime-web/dist/ort.wasm.min.mjs", "ort/ort.wasm.min.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort/ort-wasm-simd-threaded.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort/ort-wasm-simd-threaded.wasm"],
  ["pdfjs-dist/build/pdf.min.mjs", "pdfjs/pdf.min.mjs"],
  ["pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs"],
  ["@gutenye/ocr-models/assets/ch_PP-OCRv4_det_infer.onnx", "ocr/det.onnx"],
  ["@gutenye/ocr-models/assets/ch_PP-OCRv4_rec_infer.onnx", "ocr/rec.onnx"],
  ["@gutenye/ocr-models/assets/ppocr_keys_v1.txt", "ocr/keys.txt"],
];
for (const [from, to] of files) {
  const source = join(modules, from);
  const destination = join(target, to);
  if (!existsSync(source)) throw new Error(`Missing OCR asset ${from}; run pnpm install.`);
  if (existsSync(destination) && statSync(destination).size === statSync(source).size) continue;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
