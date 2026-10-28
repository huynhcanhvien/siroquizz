import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  ACTIVITY_WINDOW_MS,
  FAST_MS,
  MAX_BACKOFF_MS,
  SLOW_MS,
  initialSyncState,
  nextDelayMs,
  reduce,
  statusOf,
} from "./sync-state";

function edits(...texts: string[]) {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on("update", (update: Uint8Array) => updates.push(update));
  for (const text of texts) doc.getText("quill").insert(doc.getText("quill").length, text);
  return updates;
}
const textOf = (update: Uint8Array | null) => {
  const doc = new Y.Doc();
  if (update) Y.applyUpdate(doc, update);
  return doc.getText("quill").toString();
};

describe("sync reducer", () => {
  it("merges local edits into one pending update", () => {
    const [a, b] = edits("Xin ", "chào");
    let state = initialSyncState(0, false, 0);
    state = reduce(state, { type: "local", update: a, at: 5 });
    state = reduce(state, { type: "local", update: b, at: 6 });
    expect(textOf(state.pending)).toBe("Xin chào");
    expect(state.lastActivityAt).toBe(6);
  });
  it("moves pending to in flight, clears it on success and records the version", () => {
    const [a] = edits("a");
    let state = reduce(initialSyncState(0, false, 0), { type: "local", update: a, at: 1 });
    state = reduce(state, { type: "sent", at: 2 });
    expect(state.pending).toBeNull();
    expect(state.inFlight).toBe(a);
    state = reduce(state, { type: "ok", version: 3, hadRemote: false, readOnly: false, at: 9 });
    expect(state).toMatchObject({ inFlight: null, version: 3, failures: 0, lastActivityAt: 1 });
    state = reduce(state, { type: "ok", version: 4, hadRemote: true, readOnly: false, at: 20 });
    expect(state.lastActivityAt).toBe(20);
  });
  it("re-merges what was in flight with newer edits after a failure", () => {
    const [a, b] = edits("first ", "second");
    let state = reduce(initialSyncState(0, false, 0), { type: "local", update: a, at: 1 });
    state = reduce(state, { type: "sent", at: 2 });
    state = reduce(state, { type: "local", update: b, at: 3 });
    state = reduce(state, { type: "fail", code: "NETWORK", at: 4 });
    expect(textOf(state.pending)).toBe("first second");
    expect(state).toMatchObject({ inFlight: null, failures: 1 });
  });
  it.each(["FORBIDDEN", "SESSION_CLOSED"] as const)("becomes read-only on %s", (code) => {
    const [a] = edits("x");
    let state = reduce(initialSyncState(0, false, 0), { type: "local", update: a, at: 1 });
    state = reduce(reduce(state, { type: "sent", at: 2 }), { type: "fail", code, at: 3 });
    expect(state).toMatchObject({ readOnly: true, pending: null, inFlight: null });
  });
  it("drops changes that can never be saved", () => {
    const [a] = edits("x");
    let state = reduce(initialSyncState(0, false, 0), { type: "local", update: a, at: 1 });
    state = reduce(reduce(state, { type: "sent", at: 2 }), {
      type: "fail",
      code: "NOT_FOUND",
      at: 3,
    });
    expect(state).toMatchObject({ pending: null, inFlight: null, failures: 0, readOnly: false });
  });
  it("keeps text that is too large to save and says so, instead of dropping it", () => {
    const [a] = edits("a very long paste");
    let state = reduce(initialSyncState(0, false, 0), { type: "local", update: a, at: 1 });
    state = reduce(reduce(state, { type: "sent", at: 2 }), {
      type: "fail",
      code: "DOC_TOO_LARGE",
      at: 3,
    });
    expect(textOf(state.pending)).toBe("a very long paste");
    expect(state).toMatchObject({ inFlight: null, tooLarge: true, failures: 1 });
    expect(statusOf(state)).toBe("toolarge");
    state = reduce(state, { type: "ok", version: 1, hadRemote: false, readOnly: false, at: 4 });
    expect(state.tooLarge).toBe(false);
  });
});

describe("sync schedule", () => {
  it("polls fast within 30s of activity, then slowly", () => {
    const state = initialSyncState(0, false, 1000);
    expect(nextDelayMs(state, 1000 + ACTIVITY_WINDOW_MS - 1)).toBe(FAST_MS);
    expect(nextDelayMs(state, 1000 + ACTIVITY_WINDOW_MS)).toBe(SLOW_MS);
  });
  it("backs off exponentially after failures, up to a minute", () => {
    const state = { ...initialSyncState(0, false, 0), failures: 1 };
    expect(nextDelayMs(state, 0)).toBe(2 * SLOW_MS);
    expect(nextDelayMs({ ...state, failures: 5 }, 0)).toBe(MAX_BACKOFF_MS);
  });
  it("pauses in a hidden tab unless something is waiting to be saved", () => {
    const hidden = reduce(initialSyncState(0, false, 0), { type: "visibility", hidden: true });
    expect(nextDelayMs(hidden, 0)).toBeNull();
    const [a] = edits("x");
    expect(nextDelayMs(reduce(hidden, { type: "local", update: a, at: 0 }), 0)).toBe(FAST_MS);
  });
});
