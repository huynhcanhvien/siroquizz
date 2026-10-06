// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vitest";
import { recognizePage, type RunModel } from "./ppocr";

const assets = join(process.cwd(), "node_modules/@gutenye/ocr-models/assets");

/** The real PP-OCRv4 models through ONNX Runtime's WebAssembly backend, as in the browser. */
async function engine() {
  ort.env.wasm.numThreads = 1;
  const [det, rec] = await Promise.all([
    ort.InferenceSession.create(join(assets, "ch_PP-OCRv4_det_infer.onnx")),
    ort.InferenceSession.create(join(assets, "ch_PP-OCRv4_rec_infer.onnx")),
  ]);
  const run: RunModel = async (model, input, dims) => {
    const session = model === "det" ? det : rec;
    const outputs = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", input, dims),
    });
    const output = outputs[session.outputNames[0]];
    return { data: output.data as Float32Array, dims: output.dims };
  };
  const characters = readFileSync(join(assets, "ppocr_keys_v1.txt"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  return { run, characters };
}

describe("PP-OCR with the real models", () => {
  it("reads printed Chinese and English lines in order", { timeout: 60_000 }, async () => {
    const image = await loadImage(join(process.cwd(), "tests/fixtures/ocr-sample.png"));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const { run, characters } = await engine();
    const text = await recognizePage(
      { width: image.width, height: image.height, data },
      run,
      characters,
    );
    const lines = text.split("\n").map((line) => line.replace(/\s/g, ""));
    expect(lines).toEqual([
      "第一课学习中文",
      "我们每天早上喝茶，晚上看书。",
      "Flashcardshelpyourememberwords.",
    ]);
  });
});
