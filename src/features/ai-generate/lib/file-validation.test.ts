import { describe, expect, it } from "vitest";
import { isTextFile, MAX_FILE_BYTES, MAX_FILES, validateFiles } from "./file-validation";

function makeFile(name: string, type: string, size = 10): File {
  const file = new File(["x".repeat(Math.min(size, 10))], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateFiles", () => {
  it("accepts supported documents and images", () => {
    const files = [
      makeFile("a.pdf", "application/pdf"),
      makeFile("b.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      makeFile("c.txt", "text/plain"),
      makeFile("d.md", ""),
      makeFile("e.png", "image/png"),
    ];
    const result = validateFiles([], files);
    expect(result.accepted).toHaveLength(5);
    expect(result.errors).toEqual([]);
  });

  it("rejects unsupported types even if the extension looks fine", () => {
    const result = validateFiles(
      [],
      [makeFile("virus.pdf", "application/x-msdownload"), makeFile("song.mp3", "audio/mpeg")],
    );
    expect(result.accepted).toEqual([]);
    expect(result.errors).toEqual([
      { code: "unsupported", name: "virus.pdf" },
      { code: "unsupported", name: "song.mp3" },
    ]);
  });

  it("rejects names whose extension is an Object prototype key", () => {
    const names = ["x.constructor", "x.toString", "x.__proto__", "x.hasOwnProperty"];
    const result = validateFiles(
      [],
      names.map((name) => makeFile(name, "")),
    );
    expect(result.accepted).toEqual([]);
    expect(result.errors.map((error) => error.code)).toEqual([
      "unsupported",
      "unsupported",
      "unsupported",
      "unsupported",
    ]);
  });

  it("rejects files over the size limit and empty files", () => {
    const result = validateFiles(
      [],
      [
        makeFile("big.pdf", "application/pdf", MAX_FILE_BYTES + 1),
        makeFile("empty.txt", "text/plain", 0),
      ],
    );
    expect(result.errors.map((error) => error.code)).toEqual(["tooLarge", "empty"]);
  });

  it("enforces the maximum number of files including already selected ones", () => {
    const existing = Array.from({ length: MAX_FILES - 1 }, (_, i) =>
      makeFile(`f${i}.txt`, "text/plain"),
    );
    const result = validateFiles(existing, [
      makeFile("x.txt", "text/plain"),
      makeFile("y.txt", "text/plain"),
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.errors).toEqual([{ code: "tooMany", name: "y.txt" }]);
  });

  it("limits combined upload size including already selected files", () => {
    const existing = Array.from({ length: 4 }, (_, i) =>
      makeFile(`large${i}.pdf`, "application/pdf", MAX_FILE_BYTES),
    );
    expect(validateFiles(existing, [makeFile("extra.pdf", "application/pdf")]).errors).toEqual([
      { code: "totalTooLarge", name: "extra.pdf" },
    ]);
  });
  it("skips duplicates of already selected files", () => {
    const existing = [makeFile("a.txt", "text/plain")];
    expect(validateFiles(existing, [makeFile("a.txt", "text/plain")]).accepted).toEqual([]);
  });
});

describe("isTextFile", () => {
  it("detects plain-text formats by extension", () => {
    expect(isTextFile(makeFile("notes.CSV", ""))).toBe(true);
    expect(isTextFile(makeFile("scan.pdf", "application/pdf"))).toBe(false);
  });
});
