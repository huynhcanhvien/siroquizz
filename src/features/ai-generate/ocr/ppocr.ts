/**
 * A small PP-OCRv4 pipeline (text detection, then line recognition) over raw RGBA pixels. It
 * follows RapidOCR's pre- and post-processing without OpenCV, so it runs in a browser worker with
 * any ONNX runtime: the caller supplies `run`, which feeds one tensor to a model.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA bytes, row by row (ImageData layout). */
  data: Uint8ClampedArray | Uint8Array;
}
export interface ModelOutput {
  data: Float32Array;
  dims: readonly number[];
}
export type RunModel = (
  model: "det" | "rec",
  input: Float32Array,
  dims: [number, number, number, number],
) => Promise<ModelOutput>;

/**
 * A detected text line as a rotated rectangle in source pixels (scans are rarely perfectly
 * straight): the corner where reading starts, the reading direction, and the line's size.
 */
export interface TextBox {
  x: number;
  y: number;
  /** Unit vector along the line; the line's thickness runs along (-uy, ux). */
  ux: number;
  uy: number;
  length: number;
  thickness: number;
}

// Detection, as RapidOCR configures PP-OCRv4.
const DET_MIN_SIDE = 736;
const DET_MAX_SIDE = 2048;
const DET_THRESHOLD = 0.3;
const DET_BOX_THRESHOLD = 0.5;
const DET_UNCLIP_RATIO = 1.6;
const DET_MIN_SIZE = 3;
const DET_MAX_CANDIDATES = 1000;
// Recognition.
const REC_HEIGHT = 48;
const REC_MIN_WIDTH = 320;
const REC_MAX_WIDTH = 3200;
/** Lines recognised with less average confidence than this are noise (pictures, smudges). */
const REC_MIN_SCORE = 0.5;
/** Boxes whose starts differ by less than this vertically are on the same printed line. */
const SAME_LINE_PX = 10;

const roundTo32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);

/** Maps an output pixel's centre to source coordinates. */
type Sampler = (x: number, y: number) => readonly [number, number];

/**
 * Samples the image into a CHW float tensor in BGR order (as the models were trained on OpenCV
 * images), normalised to [-1, 1]. Bilinear sampling; columns past `drawWidth` stay 0 (padding).
 */
function toTensor(
  image: RgbaImage,
  sample: Sampler,
  outWidth: number,
  outHeight: number,
  drawWidth = outWidth,
) {
  const plane = outWidth * outHeight;
  const tensor = new Float32Array(3 * plane);
  const { data, width, height } = image;
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < drawWidth; x++) {
      const [px, py] = sample(x + 0.5, y + 0.5);
      // Pixel centres sit at +0.5; clamp to the image edge.
      const sx = Math.min(width - 1, Math.max(0, px - 0.5));
      const sy = Math.min(height - 1, Math.max(0, py - 0.5));
      const xa = Math.floor(sx),
        ya = Math.floor(sy);
      const xb = Math.min(width - 1, xa + 1),
        yb = Math.min(height - 1, ya + 1);
      const fx = sx - xa,
        fy = sy - ya;
      const offset = y * outWidth + x;
      for (let c = 0; c < 3; c++) {
        // RGBA index of the B, G, R channel for output planes 0, 1, 2.
        const channel = 2 - c;
        const top =
          data[(ya * width + xa) * 4 + channel] * (1 - fx) +
          data[(ya * width + xb) * 4 + channel] * fx;
        const bottom =
          data[(yb * width + xa) * 4 + channel] * (1 - fx) +
          data[(yb * width + xb) * 4 + channel] * fx;
        tensor[c * plane + offset] = ((top * (1 - fy) + bottom * fy) / 255 - 0.5) / 0.5;
      }
    }
  }
  return tensor;
}

/** The detection input size: shortest side at least 736px, both sides multiples of 32. */
export function detectionSize(width: number, height: number) {
  const up = Math.min(width, height) < DET_MIN_SIDE ? DET_MIN_SIDE / Math.min(width, height) : 1;
  const down =
    Math.max(width, height) * up > DET_MAX_SIDE ? DET_MAX_SIDE / (Math.max(width, height) * up) : 1;
  const ratio = up * down;
  return {
    width: roundTo32(Math.trunc(width * ratio)),
    height: roundTo32(Math.trunc(height * ratio)),
  };
}

interface Region {
  label: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Pixel count and moment sums, for the region's principal direction. */
  n: number;
  sx: number;
  sy: number;
  sxx: number;
  syy: number;
  sxy: number;
}

/** Labels the 8-connected regions of `mask` (1-based in `labels`) with their bounds and moments. */
function labelRegions(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const regions: Region[] = [];
  for (let start = 0; start < mask.length && regions.length < DET_MAX_CANDIDATES; start++) {
    if (!mask[start] || labels[start]) continue;
    const region: Region = {
      label: regions.length + 1,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      n: 0,
      sx: 0,
      sy: 0,
      sxx: 0,
      syy: 0,
      sxy: 0,
    };
    let top = 0;
    stack[top++] = start;
    labels[start] = region.label;
    while (top) {
      const index = stack[--top];
      const x = index % width,
        y = (index - x) / width;
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minY = Math.min(region.minY, y);
      region.maxY = Math.max(region.maxY, y);
      region.n++;
      region.sx += x;
      region.sy += y;
      region.sxx += x * x;
      region.syy += y * y;
      region.sxy += x * y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !labels[next]) {
            labels[next] = region.label;
            stack[top++] = next;
          }
        }
    }
    regions.push(region);
  }
  return { labels, regions };
}

/**
 * The region's rotated bounding rectangle along its principal direction (the minimum-area box
 * for a line of text), with the mean detector confidence inside it.
 */
function rotatedRect(
  region: Region,
  labels: Int32Array,
  probabilities: Float32Array,
  width: number,
) {
  const { n } = region;
  const mx = region.sx / n,
    my = region.sy / n;
  const cxx = region.sxx / n - mx * mx,
    cyy = region.syy / n - my * my,
    cxy = region.sxy / n - mx * my;
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  let ux = Math.cos(angle),
    uy = Math.sin(angle);
  // Read left to right, or top to bottom for vertical lines.
  if (Math.abs(ux) >= Math.abs(uy) ? ux < 0 : uy < 0) {
    ux = -ux;
    uy = -uy;
  }
  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;
  for (let y = region.minY; y <= region.maxY; y++)
    for (let x = region.minX; x <= region.maxX; x++) {
      if (labels[y * width + x] !== region.label) continue;
      const u = (x + 0.5) * ux + (y + 0.5) * uy,
        v = -(x + 0.5) * uy + (y + 0.5) * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  // Pixels are unit squares around their centres.
  minU -= 0.5;
  maxU += 0.5;
  minV -= 0.5;
  maxV += 0.5;
  let sum = 0,
    count = 0;
  for (let y = region.minY; y <= region.maxY; y++)
    for (let x = region.minX; x <= region.maxX; x++) {
      const u = (x + 0.5) * ux + (y + 0.5) * uy,
        v = -(x + 0.5) * uy + (y + 0.5) * ux;
      if (u < minU || u > maxU || v < minV || v > maxV) continue;
      sum += probabilities[y * width + x];
      count++;
    }
  return {
    ux,
    uy,
    minU,
    minV,
    length: maxU - minU,
    thickness: maxV - minV,
    score: count ? sum / count : 0,
  };
}

/**
 * Turns the detector's probability map into text-line boxes in source pixels: threshold, a 2×2
 * dilation, connected regions, a confidence check inside each region's rotated rectangle, then
 * the DB "unclip" expansion.
 */
export function boxesFromProbabilities(
  probabilities: Float32Array,
  mapWidth: number,
  mapHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): TextBox[] {
  const mask = new Uint8Array(mapWidth * mapHeight);
  for (let y = 0; y < mapHeight; y++)
    for (let x = 0; x < mapWidth; x++) {
      // Dilation with a 2×2 kernel: a pixel is set when it or its left, upper or upper-left
      // neighbour is above the threshold.
      const above = (xx: number, yy: number) =>
        xx >= 0 && yy >= 0 && probabilities[yy * mapWidth + xx] > DET_THRESHOLD;
      if (above(x, y) || above(x - 1, y) || above(x, y - 1) || above(x - 1, y - 1))
        mask[y * mapWidth + x] = 1;
    }
  const { labels, regions } = labelRegions(mask, mapWidth, mapHeight);
  const scaleX = sourceWidth / mapWidth,
    scaleY = sourceHeight / mapHeight;
  const boxes: TextBox[] = [];
  for (const region of regions) {
    const rect = rotatedRect(region, labels, probabilities, mapWidth);
    if (Math.min(rect.length, rect.thickness) < DET_MIN_SIZE) continue;
    if (rect.score < DET_BOX_THRESHOLD) continue;
    // DB shrinks text regions when training; grow the box back by area × ratio / perimeter.
    const grow =
      (rect.length * rect.thickness * DET_UNCLIP_RATIO) / (2 * (rect.length + rect.thickness));
    const length = rect.length + 2 * grow,
      thickness = rect.thickness + 2 * grow;
    if (Math.min(length, thickness) < DET_MIN_SIZE + 2) continue;
    // Start corner in map pixels, then everything in source pixels.
    const u0 = rect.minU - grow,
      v0 = rect.minV - grow;
    const cornerX = u0 * rect.ux - v0 * rect.uy,
      cornerY = u0 * rect.uy + v0 * rect.ux;
    const alongX = rect.ux * scaleX,
      alongY = rect.uy * scaleY;
    const along = Math.hypot(alongX, alongY);
    const across = Math.hypot(rect.uy * scaleX, rect.ux * scaleY);
    boxes.push({
      x: cornerX * scaleX,
      y: cornerY * scaleY,
      ux: alongX / along,
      uy: alongY / along,
      length: length * along,
      thickness: thickness * across,
    });
  }
  return boxes;
}

/** Reading order: top to bottom, and left to right for boxes on the same line. */
export function orderBoxes(boxes: readonly TextBox[]): TextBox[][] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextBox[][] = [];
  for (const box of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(box.y - line[0].y) < SAME_LINE_PX) line.push(box);
    else lines.push([box]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

/**
 * Greedy CTC decoding: the best class per time step, repeats merged, blanks (class 0) dropped.
 * `characters` is the model's dictionary; class i + 1 is characters[i] and the last is a space.
 */
export function decodeCtc(
  output: Float32Array,
  steps: number,
  classes: number,
  characters: readonly string[],
) {
  let text = "",
    previous = 0,
    scoreSum = 0,
    kept = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0,
      bestScore = -Infinity;
    for (let c = 0; c < classes; c++) {
      const score = output[t * classes + c];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== 0 && best !== previous) {
      text += best - 1 < characters.length ? characters[best - 1] : " ";
      scoreSum += bestScore;
      kept++;
    }
    previous = best;
  }
  return { text, score: kept ? scoreSum / kept : 0 };
}

/** Reads one text line, straightened along its box. Returns null if it does not read as text. */
async function recognizeLine(
  image: RgbaImage,
  box: TextBox,
  run: RunModel,
  characters: readonly string[],
) {
  if (box.length < 2 || box.thickness < 2) return null;
  const drawWidth = Math.min(REC_MAX_WIDTH, Math.ceil((REC_HEIGHT * box.length) / box.thickness));
  const inputWidth = Math.max(REC_MIN_WIDTH, drawWidth);
  const stepU = box.length / drawWidth,
    stepV = box.thickness / REC_HEIGHT;
  const sample: Sampler = (x, y) => [
    box.x + x * stepU * box.ux - y * stepV * box.uy,
    box.y + x * stepU * box.uy + y * stepV * box.ux,
  ];
  const input = toTensor(image, sample, inputWidth, REC_HEIGHT, drawWidth);
  const output = await run("rec", input, [1, 3, REC_HEIGHT, inputWidth]);
  const [, steps, classes] = output.dims;
  const line = decodeCtc(output.data, steps, classes, characters);
  return line.score >= REC_MIN_SCORE && line.text.trim() ? line.text.trim() : null;
}

/** Detects the text lines of a page. */
export async function detectBoxes(image: RgbaImage, run: RunModel) {
  const size = detectionSize(image.width, image.height);
  const scaleX = image.width / size.width,
    scaleY = image.height / size.height;
  const input = toTensor(image, (x, y) => [x * scaleX, y * scaleY], size.width, size.height);
  const output = await run("det", input, [1, 3, size.height, size.width]);
  const [, , mapHeight, mapWidth] = output.dims;
  return boxesFromProbabilities(output.data, mapWidth, mapHeight, image.width, image.height);
}

/** Reads a page image to text: one output line per printed line. */
export async function recognizePage(
  image: RgbaImage,
  run: RunModel,
  characters: readonly string[],
): Promise<string> {
  const lines: string[] = [];
  for (const line of orderBoxes(await detectBoxes(image, run))) {
    const parts: string[] = [];
    for (const box of line) {
      const text = await recognizeLine(image, box, run, characters);
      if (text) parts.push(text);
    }
    if (parts.length) lines.push(parts.join(" "));
  }
  return lines.join("\n");
}
