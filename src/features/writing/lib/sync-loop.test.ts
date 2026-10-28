import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { RepositoryError } from "@/lib/repository-error";
import { createStorage } from "@/lib/storage";
import type { SyncRequest, SyncResponse } from "../schemas";
import { fromBase64, toBase64 } from "./base64";
import { FAST_MS, SLOW_MS, createSyncLoop, mirrorKey, replayMirror } from "./sync-loop";

const gate = { status: "open", peerVisibility: "hidden", peerEditing: false } as const;
const memoryStorage = () => {
  const map = new Map<string, string>();
  return createStorage({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
};
/** A fake server holding the real merged document. */
function server() {
  const doc = new Y.Doc();
  let version = 0;
  const send = vi.fn(async (request: SyncRequest): Promise<SyncResponse> => {
    if (request.update) {
      Y.applyUpdate(doc, fromBase64(request.update));
      version++;
    }
    const diff = Y.encodeStateAsUpdate(doc, fromBase64(request.sv));
    return {
      version,
      readOnly: false,
      session: gate,
      ...(diff.length > 2 ? { update: toBase64(diff) } : {}),
    };
  });
  const type = (text: string) => {
    doc.getText("quill").insert(0, text);
    version++;
  };
  return { doc, send, type };
}
const text = (doc: Y.Doc) => doc.getText("quill").toString();

function setup(overrides: Partial<Parameters<typeof createSyncLoop>[0]> = {}) {
  const remote = server();
  const doc = new Y.Doc();
  const storage = memoryStorage();
  const onChange = vi.fn(),
    onError = vi.fn(),
    beacon = vi.fn();
  const loop = createSyncLoop({
    doc,
    docId: "doc",
    userId: "me",
    version: 0,
    readOnly: false,
    send: remote.send,
    beacon,
    storage,
    onChange,
    onError,
    ...overrides,
  });
  return { remote, doc, storage, onChange, onError, beacon, loop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sync loop", () => {
  it("sends local edits, applies remote ones and does not echo them back", async () => {
    const { remote, doc, loop, onChange } = setup();
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    doc.getText("quill").insert(0, "local ");
    await vi.advanceTimersByTimeAsync(FAST_MS);
    expect(text(remote.doc)).toBe("local ");
    expect(onChange).toHaveBeenLastCalledWith(expect.anything(), "idle");
    remote.type("remote ");
    await vi.advanceTimersByTimeAsync(FAST_MS);
    expect(text(doc)).toBe(text(remote.doc));
    const sentUpdates = remote.send.mock.calls.filter(([request]) => request.update);
    expect(sentUpdates).toHaveLength(1);
    loop.stop();
  });

  it("passes on the session settings each sync reports", async () => {
    const onSession = vi.fn();
    const { loop } = setup({ onSession });
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onSession).toHaveBeenCalledWith(gate);
    loop.stop();
  });

  it("keeps edits through a network failure and retries after backing off", async () => {
    const { remote, doc, loop, storage } = setup();
    remote.send.mockRejectedValueOnce(new RepositoryError("NETWORK"));
    doc.getText("quill").insert(0, "saved later");
    loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(loop.state().failures).toBe(1);
    // Unsaved edits are mirrored locally in the meantime.
    expect(storage.readValue(mirrorKey("doc"), (await import("zod")).z.any())).toMatchObject({
      userId: "me",
    });
    await vi.advanceTimersByTimeAsync(2 * SLOW_MS);
    expect(text(remote.doc)).toBe("saved later");
    await vi.advanceTimersByTimeAsync(300);
    expect(storage.readValue(mirrorKey("doc"), (await import("zod")).z.any())).toBeNull();
    loop.stop();
  });

  it("turns read-only when the session closes and reports it", async () => {
    const { remote, doc, loop, onError, onChange } = setup();
    remote.send.mockRejectedValueOnce(new RepositoryError("SESSION_CLOSED"));
    doc.getText("quill").insert(0, "too late");
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith("SESSION_CLOSED");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ pending: null }),
      "readonly",
    );
    loop.stop();
  });

  it("replays mirrored edits of the same person and sends them first", async () => {
    const storage = memoryStorage();
    const old = new Y.Doc();
    old.getText("quill").insert(0, "offline words");
    const update = toBase64(Y.encodeStateAsUpdate(old));
    storage.writeValue(mirrorKey("doc"), { userId: "other", update, savedAt: Date.now() });
    expect(replayMirror(new Y.Doc(), "doc", "me", storage)).toBe(false);
    storage.writeValue(mirrorKey("doc"), {
      userId: "me",
      update,
      savedAt: Date.now() - 8 * 86400_000,
    });
    expect(replayMirror(new Y.Doc(), "doc", "me", storage)).toBe(false);
    storage.writeValue(mirrorKey("doc"), { userId: "me", update, savedAt: Date.now() });
    const { remote, doc, loop } = setup({ storage });
    expect(replayMirror(doc, "doc", "me", storage)).toBe(true);
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(text(remote.doc)).toBe("offline words");
    loop.stop();
  });

  it("stops polling in a hidden tab and flushes edits with a keepalive request", async () => {
    const { remote, doc, loop, beacon } = setup();
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    const calls = remote.send.mock.calls.length;
    loop.setHidden(true);
    await vi.advanceTimersByTimeAsync(5 * SLOW_MS);
    expect(remote.send.mock.calls.length).toBe(calls);
    doc.getText("quill").insert(0, "x");
    loop.setHidden(true);
    expect(beacon).toHaveBeenCalledWith(expect.objectContaining({ update: expect.any(String) }));
    loop.stop();
  });

  it("never runs two rounds at once, so a slow poll cannot swallow a newer edit", async () => {
    const { remote, doc, loop } = setup();
    const answer = remote.send.getMockImplementation()!;
    let release: () => void = () => undefined;
    remote.send.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          release = () => resolve(answer(request));
        }),
    );
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    doc.getText("quill").insert(0, "typed during a slow poll");
    loop.syncNow();
    await vi.advanceTimersByTimeAsync(FAST_MS);
    expect(remote.send).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(FAST_MS);
    expect(text(remote.doc)).toBe("typed during a slow poll");
    expect(loop.state().pending).toBeNull();
    loop.stop();
  });

  it("flushes everything unsaved, in flight included, when the document closes", async () => {
    const { remote, doc, loop, beacon } = setup();
    remote.send.mockImplementation(() => new Promise(() => undefined));
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    doc.getText("quill").insert(0, "never confirmed");
    loop.stop();
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});
