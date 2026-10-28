import { describe, expect, it } from "vitest";
import {
  materializeSchema,
  scratchInputSchema,
  scratchPatchSchema,
  sessionPatchSchema,
  syncRequestSchema,
} from "./schemas";

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const base = { title: "Words", termLang: "en", definitionLang: "vi" };

describe("writing schemas", () => {
  it("accepts base64 sync payloads and rejects anything else", () => {
    expect(syncRequestSchema.safeParse({ sv: "AAA=", update: "AQID", version: 2 }).success).toBe(
      true,
    );
    expect(syncRequestSchema.safeParse({ sv: "not base64!" }).success).toBe(false);
    expect(syncRequestSchema.safeParse({ sv: "AAA=", version: -1 }).success).toBe(false);
  });
  it("bounds materialize to 2–500 distinct cards and defaults the audience", () => {
    expect(materializeSchema.parse({ ...base, ids: [id(1), id(2)] }).audience).toBe("class");
    expect(materializeSchema.safeParse({ ...base, ids: [id(1)] }).success).toBe(false);
    expect(materializeSchema.safeParse({ ...base, ids: [id(1), id(1)] }).success).toBe(false);
    const many = Array.from({ length: 501 }, (_, i) => id(i));
    expect(materializeSchema.safeParse({ ...base, ids: many }).success).toBe(false);
  });
  it("requires at least one change in patches", () => {
    expect(sessionPatchSchema.safeParse({}).success).toBe(false);
    expect(sessionPatchSchema.safeParse({ peerEditing: true }).success).toBe(true);
    expect(scratchPatchSchema.safeParse({}).success).toBe(false);
  });
  it("trims a saved word and lets the definition wait", () => {
    expect(scratchInputSchema.parse({ term: "  lá  " })).toMatchObject({
      term: "lá",
      definition: "",
    });
    expect(scratchInputSchema.safeParse({ term: "   " }).success).toBe(false);
  });
});
