import { describe, expect, it } from "vitest";
import { filterParams, updateFilters } from "./filters";
describe("admin URL filters", () => {
  it("forwards only supported filters and the cursor", () => {
    expect(
      filterParams(new URLSearchParams("q=%20Mai%20&status=error&cursor=abc&unknown=x"), [
        "q",
        "status",
      ]).toString(),
    ).toBe("q=Mai&status=error&cursor=abc");
  });
  it("resets pagination when filters change and removes cleared values", () => {
    const before = new URLSearchParams("q=old&cursor=abc&status=error");
    expect(updateFilters(before, { q: " new ", status: "" }).toString()).toBe("q=new");
    expect(before.get("cursor")).toBe("abc");
  });
  it("preserves IDs and safely encodes search text", () => {
    const next = updateFilters(new URLSearchParams("actorId=123"), {
      targetId: "a&b#c",
      action: "credit_adjust",
    });
    expect(new URLSearchParams(next.toString()).get("targetId")).toBe("a&b#c");
    expect(next.get("actorId")).toBe("123");
  });
});
