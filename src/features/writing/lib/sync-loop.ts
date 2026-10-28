import * as Y from "yjs";
import { z } from "zod";
import { toErrorCode, type RepositoryErrorCode } from "@/lib/repository-error";
import type { AppStorage } from "@/lib/storage";
import type { SyncRequest, SyncResponse } from "../schemas";
import { BASE64_PATTERN, fromBase64, toBase64 } from "./base64";
import { MAX_UPDATE_BYTES } from "./limits";
import {
  initialSyncState,
  nextDelayMs,
  reduce,
  type SyncEvent,
  type SyncState,
} from "./sync-state";

export * from "./sync-state";
/** Unsaved edits mirrored in localStorage survive a reload or a crash for a week. */
const MIRROR_MAX_AGE_MS = 7 * 86400_000;
const MIRROR_DEBOUNCE_MS = 250;
const mirrorSchema = z.object({
  userId: z.string(),
  update: z.string().regex(BASE64_PATTERN),
  savedAt: z.number(),
});
export const mirrorKey = (docId: string) => `writing-pending:${docId}`;

/**
 * Applies edits a previous visit could not save (same person, under a week old) to the local
 * document. They arrive as local changes, so the first sync sends them.
 */
export function replayMirror(
  doc: Y.Doc,
  docId: string,
  userId: string,
  storage: AppStorage,
  now = Date.now(),
): boolean {
  const saved = storage.readValue(mirrorKey(docId), mirrorSchema);
  if (!saved || saved.userId !== userId || now - saved.savedAt > MIRROR_MAX_AGE_MS) {
    if (saved) storage.remove(mirrorKey(docId));
    return false;
  }
  try {
    Y.applyUpdate(doc, fromBase64(saved.update), "replay");
    return true;
  } catch {
    storage.remove(mirrorKey(docId));
    return false;
  }
}

export type SyncStatus = "idle" | "saving" | "offline" | "readonly";
export interface SyncLoopOptions {
  doc: Y.Doc;
  docId: string;
  userId: string;
  version: number;
  readOnly: boolean;
  send: (request: SyncRequest) => Promise<SyncResponse>;
  /** Fire-and-forget send that survives the page closing (fetch keepalive). */
  beacon: (request: SyncRequest) => void;
  storage: AppStorage;
  onChange: (state: SyncState, status: SyncStatus) => void;
  onError: (code: RepositoryErrorCode) => void;
  now?: () => number;
}

export function statusOf(state: SyncState): SyncStatus {
  if (state.readOnly) return "readonly";
  if (state.failures) return "offline";
  return state.pending || state.inFlight ? "saving" : "idle";
}

/** Drives the sync protocol (C6) for one document: polling, sending edits, applying remote ones. */
export function createSyncLoop(options: SyncLoopOptions) {
  const now = options.now ?? Date.now;
  let state = initialSyncState(options.version, options.readOnly, now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const dispatch = (event: SyncEvent) => {
    state = reduce(state, event);
    options.onChange(state, statusOf(state));
    scheduleMirror();
  };
  const scheduleMirror = () => {
    if (mirrorTimer) clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(writeMirror, MIRROR_DEBOUNCE_MS);
  };
  const writeMirror = () => {
    const unsaved =
      state.pending && state.inFlight
        ? Y.mergeUpdates([state.inFlight, state.pending])
        : (state.pending ?? state.inFlight);
    if (!unsaved) return options.storage.remove(mirrorKey(options.docId));
    try {
      options.storage.writeValue(mirrorKey(options.docId), {
        userId: options.userId,
        update: toBase64(unsaved),
        savedAt: now(),
      });
    } catch {
      // Storage full or blocked: the server copy is still the source of truth.
    }
  };
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote" || state.readOnly) return;
    dispatch({ type: "local", update, at: now() });
    if (running && !timer) schedule();
  };
  const request = (): SyncRequest => ({
    sv: toBase64(Y.encodeStateVector(options.doc)),
    version: state.version,
    ...(state.inFlight ? { update: toBase64(state.inFlight) } : {}),
  });
  const tick = async () => {
    timer = null;
    if (!running || state.inFlight) return;
    const before = state.version;
    dispatch({ type: "sent", at: now() });
    const sending = Boolean(state.inFlight);
    try {
      const response = await options.send(request());
      if (response.update) Y.applyUpdate(options.doc, fromBase64(response.update), "remote");
      const hadRemote = response.version > before + (sending ? 1 : 0);
      dispatch({
        type: "ok",
        version: response.version,
        hadRemote,
        readOnly: response.readOnly,
        at: now(),
      });
    } catch (error) {
      const code = toErrorCode(error);
      dispatch({ type: "fail", code, at: now() });
      if (code !== "NETWORK" && code !== "RATE_LIMITED" && code !== "UNKNOWN")
        options.onError(code);
    }
    schedule();
  };
  const schedule = () => {
    if (!running) return;
    if (timer) clearTimeout(timer);
    timer = null;
    const delay = nextDelayMs(state, now());
    if (delay !== null) timer = setTimeout(() => void tick(), delay);
  };
  /** Sends unsaved edits while the page is going away; small enough for a keepalive body. */
  const flushNow = () => {
    const unsaved = state.pending;
    if (!unsaved || state.readOnly || unsaved.length > MAX_UPDATE_BYTES) return;
    options.beacon({
      sv: toBase64(Y.encodeStateVector(options.doc)),
      version: state.version,
      update: toBase64(unsaved),
    });
  };
  // Listen from creation so edits replayed from the mirror before start() are captured.
  options.doc.on("update", onUpdate);
  return {
    start() {
      running = true;
      void tick();
    },
    stop() {
      running = false;
      options.doc.off("update", onUpdate);
      if (timer) clearTimeout(timer);
      if (mirrorTimer) clearTimeout(mirrorTimer);
      writeMirror();
    },
    setHidden(hidden: boolean) {
      dispatch({ type: "visibility", hidden });
      if (hidden) {
        flushNow();
        schedule();
      } else void tick();
    },
    flushNow,
    syncNow: () => void tick(),
    get state() {
      return state;
    },
  };
}
export type SyncLoop = ReturnType<typeof createSyncLoop>;
