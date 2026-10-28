import { describe, expect, it } from "vitest";
import { unattributedInserts } from "./author-ranges";

describe("unattributedInserts", () => {
  it("finds typed text that inherited another author, after retains and deletes", () => {
    expect(
      unattributedInserts(
        [
          { retain: 5 },
          { delete: 2 },
          { insert: "abc", attributes: { author: "teacher", color: "red" } },
          { retain: 4 },
          { insert: "de" },
        ],
        "me",
      ),
    ).toEqual([
      { index: 5, length: 3 },
      { index: 12, length: 2 },
    ]);
  });
  it("ignores text already marked as the user's, embeds and formatting-only changes", () => {
    expect(
      unattributedInserts(
        [
          { insert: "mine", attributes: { author: "me" } },
          { insert: { image: "x" } },
          { retain: 3, attributes: { bold: true } },
          { retain: { embed: true } },
        ],
        "me",
      ),
    ).toEqual([]);
  });
});
