import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("accepts internal paths", () => {
    expect(safeNextPath("/sets/abc?tab=1")).toBe("/sets/abc?tab=1");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "sets",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/%09/evil.com".replace("%09", "\t"),
    "/\u0000/evil.com",
  ])(
    "falls back for unsafe value %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/home");
    },
  );

  it("keeps query strings and hashes of internal paths", () => {
    expect(safeNextPath("/library?q=t%C3%A1o#top")).toBe("/library?q=t%C3%A1o#top");
  });

  it("uses a custom fallback", () => {
    expect(safeNextPath(null, "/library")).toBe("/library");
  });
});
