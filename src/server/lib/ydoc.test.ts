// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  TEXT_NAME,
  applyClientUpdate,
  diffSince,
  docFromState,
  encodeState,
  plainText,
  preview,
} from "./ydoc";

/** A client document with `text` typed into it, and the update that typing produced. */
function typed(text: string, base?: Uint8Array) {
  const doc = docFromState(base ?? null);
  const before = Y.encodeStateVector(doc);
  doc.getText(TEXT_NAME).insert(doc.getText(TEXT_NAME).length, text);
  return { doc, update: Y.encodeStateAsUpdate(doc, before) };
}

describe("ydoc", () => {
  it("starts an empty document from no state", () => {
    const doc = docFromState(null);
    expect(plainText(doc)).toBe("");
    expect(diffSince(doc, Y.encodeStateVector(doc))).toBeNull();
  });
  it("applies a client update and compacts deleted content when re-encoded", () => {
    const server = docFromState(null);
    const { doc: client, update } = typed("a".repeat(2000));
    applyClientUpdate(server, update);
    expect(plainText(server)).toBe("a".repeat(2000));
    const full = encodeState(server);
    const before = Y.encodeStateVector(client);
    client.getText(TEXT_NAME).delete(0, 1990);
    applyClientUpdate(server, Y.encodeStateAsUpdate(client, before));
    expect(plainText(server)).toBe("a".repeat(10));
    // A fresh document from the compacted state keeps the content and is much smaller.
    const compacted = encodeState(server);
    expect(compacted.length).toBeLessThan(full.length);
    expect(plainText(docFromState(compacted))).toBe("a".repeat(10));
  });
  it("returns only what a client is missing, or null when it has everything", () => {
    const server = docFromState(null);
    applyClientUpdate(server, typed("hello").update);
    const behind = docFromState(null);
    const diff = diffSince(server, Y.encodeStateVector(behind));
    expect(diff).not.toBeNull();
    Y.applyUpdate(behind, diff!);
    expect(plainText(behind)).toBe("hello");
    expect(diffSince(server, Y.encodeStateVector(behind))).toBeNull();
  });
  it("rejects a malformed update with a 400", () => {
    expect(() => applyClientUpdate(docFromState(null), new Uint8Array([255, 1, 2, 3]))).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
  it("previews whole graphemes and cuts at the limit", () => {
    expect(preview("Tiếng Việt", 300)).toBe("Tiếng Việt");
    const long = "ệ".normalize("NFD").repeat(400);
    const cut = preview(long, 300);
    expect([...new Intl.Segmenter().segment(cut)]).toHaveLength(300);
    expect(cut.normalize("NFC")).toBe("ệ".repeat(300));
    expect(preview("  line one\n\nline   two  ", 300)).toBe("line one line two");
  });
});
