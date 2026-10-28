import { describe, expect, it } from "vitest";
import { writePolicy } from "./write-policy";

describe("writePolicy", () => {
  it("skips the shared write limit for AI uploads and steps, which carry their own limits", () => {
    expect(writePolicy(["ai", "jobs", "abc", "step"])).toBe("none");
    expect(writePolicy(["ai", "uploads"])).toBe("none");
    expect(writePolicy(["ai", "uploads", "abc", "file"])).toBe("none");
    expect(writePolicy(["ai", "jobs"])).toEqual({ key: "write", max: 60, seconds: 60 });
    expect(writePolicy(["ai", "jobs", "abc", "confirm"])).toEqual({
      key: "write",
      max: 60,
      seconds: 60,
    });
  });
  it("gives study-flow writes a faster bucket", () => {
    const fast = { key: "write-fast", max: 120, seconds: 60 };
    expect(writePolicy(["sets", "id", "progress"])).toEqual(fast);
    expect(writePolicy(["reviews"])).toEqual(fast);
    expect(writePolicy(["reviews", "batch"])).toEqual(fast);
    expect(writePolicy(["writing", "docs", "id", "sync"])).toEqual(fast);
  });
  it("keeps the default 60 per minute everywhere else", () => {
    const standard = { key: "write", max: 60, seconds: 60 };
    expect(writePolicy(["sets"])).toEqual(standard);
    expect(writePolicy(["sets", "id"])).toEqual(standard);
    expect(writePolicy(["sets", "id", "progress", "extra"])).toEqual(standard);
    expect(writePolicy(["writing", "docs", "id"])).toEqual(standard);
    expect(writePolicy([])).toEqual(standard);
  });
});
