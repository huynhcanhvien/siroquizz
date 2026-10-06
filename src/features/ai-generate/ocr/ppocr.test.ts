import { describe, expect, it } from "vitest";
import { boxesFromProbabilities, decodeCtc, detectionSize, orderBoxes } from "./ppocr";

describe("PP-OCR detection", () => {
  it("sizes the input to multiples of 32 with the shortest side at least 736", () => {
    expect(detectionSize(893, 1263)).toEqual({ width: 896, height: 1248 });
    expect(detectionSize(400, 300)).toEqual({ width: 992, height: 736 });
    // Huge photos are capped so the detector stays fast.
    expect(detectionSize(6000, 4000).width).toBeLessThanOrEqual(2048);
  });

  it("finds confident text lines and grows them back to full size", () => {
    const width = 40,
      height = 20;
    const map = new Float32Array(width * height);
    // One confident line (rows 5-8, columns 5-30) and a faint smudge.
    for (let y = 5; y <= 8; y++) for (let x = 5; x <= 30; x++) map[y * width + x] = 0.9;
    for (let y = 14; y <= 16; y++) for (let x = 2; x <= 6; x++) map[y * width + x] = 0.35;
    const boxes = boxesFromProbabilities(map, width, height, width * 2, height * 2);
    expect(boxes).toHaveLength(1);
    const [box] = boxes;
    // Horizontal, scaled to source pixels and expanded beyond the detected core (26 × 4).
    expect(box.ux).toBeCloseTo(1, 5);
    expect(box.uy).toBeCloseTo(0, 5);
    expect(box.x).toBeLessThan(10);
    expect(box.y).toBeLessThan(10);
    expect(box.length).toBeGreaterThan(26 * 2);
    expect(box.thickness).toBeGreaterThan(4 * 2);
  });

  it("follows lines on a slightly rotated scan instead of dropping them", () => {
    const width = 400,
      height = 60;
    const map = new Float32Array(width * height);
    // A thin line rising 1 pixel every 25: its upright bounding box would be mostly empty.
    for (let x = 20; x < 380; x++)
      for (let t = 0; t < 4; t++) map[(40 - Math.floor(x / 25) + t) * width + x] = 0.9;
    const [box] = boxesFromProbabilities(map, width, height, width, height);
    expect(box).toBeDefined();
    expect(Math.atan2(box.uy, box.ux)).toBeCloseTo(-Math.atan(1 / 25), 2);
    expect(box.length).toBeGreaterThan(360);
    expect(box.thickness).toBeLessThan(20);
  });

  it("orders boxes into lines, top to bottom and left to right", () => {
    const box = (x: number, y: number) => ({ x, y, ux: 1, uy: 0, length: 10, thickness: 10 });
    expect(orderBoxes([box(50, 42), box(0, 0), box(10, 40), box(60, 3)])).toEqual([
      [box(0, 0), box(60, 3)],
      [box(10, 40), box(50, 42)],
    ]);
  });
});

describe("PP-OCR recognition", () => {
  it("merges repeats, drops blanks and maps classes to the dictionary", () => {
    const characters = ["中", "国", "人"];
    // Classes: 0 blank, 1-3 the dictionary, 4 space.
    const best = [1, 1, 0, 2, 0, 2, 4, 3];
    const classes = 5;
    const output = new Float32Array(best.length * classes);
    best.forEach((c, t) => (output[t * classes + c] = 0.9));
    expect(decodeCtc(output, best.length, classes, characters)).toEqual({
      text: "中国国 人",
      score: expect.closeTo(0.9, 5),
    });
  });
});
