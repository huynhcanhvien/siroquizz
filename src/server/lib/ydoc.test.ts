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

describe("author attribution", () => {
  /** An update made on a replica of `base`, by running `edit` on its text. */
  function edited(base: Y.Doc, edit: (text: Y.Text) => void) {
    const replica = docFromState(encodeState(base));
    const before = Y.encodeStateVector(replica);
    edit(replica.getText(TEXT_NAME));
    return Y.encodeStateAsUpdate(replica, before);
  }
  const server = () => {
    const doc = docFromState(null);
    doc.getText(TEXT_NAME).insert(0, "teacher note", { author: "teacher" });
    return doc;
  };

  it("accepts text marked as the writer's own or unmarked", () => {
    const doc = server();
    applyClientUpdate(
      doc,
      edited(doc, (t) => t.insert(0, "mine ", { author: "me" })),
      "me",
    );
    applyClientUpdate(
      doc,
      edited(doc, (t) => t.insert(0, "\n")),
      "me",
    );
    // Deleting or styling someone else's words keeps them theirs.
    applyClientUpdate(
      doc,
      edited(doc, (t) => t.format(6, 7, { bold: true })),
      "me",
    );
    applyClientUpdate(
      doc,
      edited(doc, (t) => t.delete(0, 2)),
      "me",
    );
    expect(plainText(doc)).toBe("ine teacher note");
  });
  it("refuses text or formatting that claims someone else wrote it", () => {
    const doc = server();
    const forged = edited(doc, (t) => t.insert(0, "fake ", { author: "teacher" }));
    expect(() => applyClientUpdate(doc, forged, "me")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    const relabel = edited(doc, (t) => t.format(0, 7, { author: "other" }));
    expect(() => applyClientUpdate(doc, relabel, "me")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});
