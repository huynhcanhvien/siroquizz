import { describe, expect, it } from "vitest";
import { authorStyles, toneFor } from "./author-colors";

const members = [
  { userId: "teach1", role: "owner" as const },
  { userId: "co_2", role: "teacher" as const },
  { userId: "stu-a", role: "student" as const },
  { userId: "stu-b", role: "student" as const },
];

describe("author colours", () => {
  it("colours by the writer's role relative to the document's author", () => {
    expect(toneFor("stu-a", "stu-a", members)).toBe("author");
    expect(toneFor("teach1", "stu-a", members)).toBe("teacher");
    expect(toneFor("co_2", "stu-a", members)).toBe("teacher");
    expect(toneFor("stu-b", "stu-a", members)).toBe("peer");
    expect(toneFor("gone", "stu-a", members)).toBe("unknown");
  });
  it("emits theme-token rules, with the author's own text left plain", () => {
    const css = authorStyles("stu-a", members);
    expect(css).toContain(".ql-editor .ql-author-teach1{color:var(--danger)}");
    expect(css).toContain(".ql-editor .ql-author-stu-b{color:var(--accent-text)}");
    expect(css).toContain(".ql-editor .ql-author-stu-a{color:inherit}");
    // The fallback for former members comes first so specific rules override it.
    expect(css.indexOf("[class*=")).toBeLessThan(css.indexOf("ql-author-teach1"));
  });
  it("keeps the author's text plain even after they left the class", () => {
    expect(authorStyles("left", members).split("\n").at(-1)).toBe(
      ".ql-editor .ql-author-left{color:inherit}",
    );
  });
  it("never puts unsafe ids into CSS", () => {
    const css = authorStyles("stu-a", [
      ...members,
      { userId: "x}body{display:none", role: "student" },
    ]);
    expect(css).not.toContain("display:none");
    expect(authorStyles("a}b", [])).not.toContain("a}b");
  });
});
