import { describe, expect, it } from "vitest";
import { v7 } from "uuid";
import {
  ADMIN_PAGE_SIZE,
  MAX_CREDIT_ADJUSTMENT,
  auditListQuery,
  containsPattern,
  creditInput,
  jobListQuery,
  parseQuery,
  setListQuery,
  toPage,
  userListQuery,
} from "./schemas";

describe("admin query parsing", () => {
  it("treats empty filters as absent", () => {
    const query = parseQuery(jobListQuery, new URLSearchParams("status=&userId=&cursor="));
    expect(query).toEqual({ status: undefined, userId: undefined, cursor: undefined });
  });

  it("trims the search and rejects a malformed cursor", () => {
    expect(parseQuery(userListQuery, new URLSearchParams("q=%20an%20")).q).toBe("an");
    expect(() => parseQuery(userListQuery, new URLSearchParams("cursor=abc"))).toThrow();
  });

  it("accepts only known set and job filters", () => {
    expect(parseQuery(setListQuery, new URLSearchParams("status=hidden")).status).toBe("hidden");
    expect(() => parseQuery(setListQuery, new URLSearchParams("status=deleted"))).toThrow();
    expect(() => parseQuery(jobListQuery, new URLSearchParams("status=queued"))).toThrow();
  });

  it("only allows snake_case audit actions", () => {
    expect(parseQuery(auditListQuery, new URLSearchParams("action=user_ban")).action).toBe(
      "user_ban",
    );
    expect(() => parseQuery(auditListQuery, new URLSearchParams("action=x'--"))).toThrow();
  });
});

describe("creditInput", () => {
  it("rejects zero, fractions and adjustments over the cap", () => {
    expect(creditInput.safeParse({ delta: 0, note: "x" }).success).toBe(false);
    expect(creditInput.safeParse({ delta: 1.5, note: "x" }).success).toBe(false);
    expect(creditInput.safeParse({ delta: MAX_CREDIT_ADJUSTMENT + 1, note: "x" }).success).toBe(
      false,
    );
    expect(creditInput.safeParse({ delta: -MAX_CREDIT_ADJUSTMENT, note: "x" }).success).toBe(true);
  });

  it("requires a note", () => {
    expect(creditInput.safeParse({ delta: 5, note: "   " }).success).toBe(false);
  });
});

describe("containsPattern", () => {
  it("escapes LIKE wildcards", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("toPage", () => {
  const rows = (count: number) => Array.from({ length: count }, () => ({ id: v7() }));

  it("returns no cursor on the last page", () => {
    expect(toPage(rows(3))).toEqual({ items: expect.any(Array), nextCursor: null });
  });

  it("drops the look-ahead row and points the cursor at the last item", () => {
    const all = rows(ADMIN_PAGE_SIZE + 1);
    const page = toPage(all);
    expect(page.items).toHaveLength(ADMIN_PAGE_SIZE);
    expect(page.nextCursor).toBe(all[ADMIN_PAGE_SIZE - 1].id);
  });
});
