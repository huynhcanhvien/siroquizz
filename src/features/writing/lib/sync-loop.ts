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

/** Everything not yet confirmed by the server, oldest first. */
const unsavedOf = (state: SyncState) =>
  state.pending && state.inFlight
    ? Y.mergeUpdates([state.inFlight, state.pending])
    : (state.pending ?? state.inFlight);
/** Errors the loop handles by retrying; anything else is reported to the page. */
const RETRIED: ReadonlySet<RepositoryErrorCode> = new Set(["NETWORK", "RATE_LIMITED", "UNKNOWN"]);

/** Mirrors unsaved edits to localStorage, debounced, so a reload or crash does not lose them. */
function createMirror(options: SyncLoopOptions, now: () => number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const write = (state: SyncState) => {
    const unsaved = unsavedOf(state);
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
  return {
    schedule(state: SyncState) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => write(state), MIRROR_DEBOUNCE_MS);
    },
    flush(state: SyncState) {
      if (timer) clearTimeout(timer);
      write(state);
    },
  };
}

/** One request/response of the protocol: sends what is in flight, applies what comes back. */
async function syncRound(
  options: SyncLoopOptions,
  state: SyncState,
  dispatch: (event: SyncEvent) => void,
  now: () => number,
) {
  const sentUpdate = state.inFlight;
  try {
    const response = await options.send({
      sv: toBase64(Y.encodeStateVector(options.doc)),
      version: state.version,
      ...(sentUpdate ? { update: toBase64(sentUpdate) } : {}),
    });
    if (response.update) Y.applyUpdate(options.doc, fromBase64(response.update), "remote");
    // Our own write moves the version by one; anything more means someone else wrote.
    const hadRemote = response.version > state.version + (sentUpdate ? 1 : 0);
    const { version, readOnly } = response;
    dispatch({ type: "ok", version, hadRemote, readOnly, at: now() });
  } catch (error) {
    const code = toErrorCode(error);
    dispatch({ type: "fail", code, at: now() });
    if (!RETRIED.has(code)) options.onError(code);
  }
}

/** Drives the sync protocol (C6) for one document: polling, sending edits, applying remote ones. */
export function createSyncLoop(options: SyncLoopOptions) {
  const now = options.now ?? Date.now;
  const mirror = createMirror(options, now);
  let state = initialSyncState(options.version, options.readOnly, now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  // One round at a time: an "ok" from an older poll must never clear a newer round's update.
  let busy = false;
  const dispatch = (event: SyncEvent) => {
    state = reduce(state, event);
    options.onChange(state, statusOf(state));
    mirror.schedule(state);
  };
  const tick = async () => {
    timer = null;
    if (!running || busy) return;
    busy = true;
    dispatch({ type: "sent", at: now() });
    try {
      await syncRound(options, state, dispatch, now);
    } finally {
      busy = false;
    }
    schedule();
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const delay = running ? nextDelayMs(state, now()) : null;
    if (delay !== null) timer = setTimeout(() => void tick(), delay);
  };
  /**
   * Sends everything unsaved while the page or document is going away (keepalive body limit),
   * including a request that may be cut off by the unload, and saves the mirror right away.
   */
  const flushNow = () => {
    mirror.flush(state);
    const unsaved = unsavedOf(state);
    if (!unsaved || state.readOnly || unsaved.length > MAX_UPDATE_BYTES) return;
    const sv = toBase64(Y.encodeStateVector(options.doc));
    options.beacon({ sv, version: state.version, update: toBase64(unsaved) });
  };
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    // Edits made just before the editor turns read-only are still sent; the server refuses
    // them and the page reloads the document, so the local copy never silently diverges.
    if (origin === "remote") return;
    dispatch({ type: "local", update, at: now() });
    if (running && !timer) schedule();
  };
  // Listen from creation so edits replayed from the mirror before start() are captured.
  options.doc.on("update", onUpdate);
  const stop = () => {
    running = false;
    options.doc.off("update", onUpdate);
    if (timer) clearTimeout(timer);
    flushNow();
  };
  const setHidden = (hidden: boolean) => {
    dispatch({ type: "visibility", hidden });
    if (hidden) flushNow();
    if (hidden) schedule();
    else void tick();
  };
  const start = () => {
    running = true;
    void tick();
  };
  return { start, stop, setHidden, flushNow, syncNow: () => void tick(), state: () => state };
}
export type SyncLoop = ReturnType<typeof createSyncLoop>;
