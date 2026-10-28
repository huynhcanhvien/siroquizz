import { describe, expect, it } from "vitest";
import { BASE64_PATTERN, base64Bytes, fromBase64, toBase64 } from "./base64";

describe("base64", () => {
  it("round-trips bytes of every length, including large buffers", () => {
    for (const length of [0, 1, 2, 3, 4, 100_000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37) % 256);
      const encoded = toBase64(bytes);
      expect(encoded).toMatch(BASE64_PATTERN);
      expect(base64Bytes(encoded)).toBe(length);
      expect(fromBase64(encoded)).toEqual(bytes);
    }
  });
  it("matches Node's encoding", () => {
    const bytes = new TextEncoder().encode("Việt 中文");
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
  it.each(["abc", "a b=", "@@@@", "abcd="])("rejects malformed input %s", (value) => {
    expect(() => fromBase64(value)).toThrow();
  });
});
