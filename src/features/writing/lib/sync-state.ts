import * as Y from "yjs";
import type { RepositoryErrorCode } from "@/lib/repository-error";

/** Poll every 2s while someone (here or elsewhere) typed in the last 30s, else every 10s. */
export const FAST_MS = 2_000;
export const SLOW_MS = 10_000;
export const ACTIVITY_WINDOW_MS = 30_000;
export const MAX_BACKOFF_MS = 60_000;

export interface SyncState {
  /** Local changes not yet sent. */
  pending: Uint8Array | null;
  /** Changes sent and waiting for an answer. */
  inFlight: Uint8Array | null;
  version: number;
  lastActivityAt: number;
  failures: number;
  readOnly: boolean;
  hidden: boolean;
  /** The unsaved text is larger than the server accepts; it is kept locally, never dropped. */
  tooLarge: boolean;
}
export type SyncEvent =
  | { type: "local"; update: Uint8Array; at: number }
  | { type: "sent"; at: number }
  | { type: "ok"; version: number; hadRemote: boolean; readOnly: boolean; at: number }
  | { type: "fail"; code: RepositoryErrorCode; at: number }
  | { type: "visibility"; hidden: boolean };

export const initialSyncState = (version: number, readOnly: boolean, now: number): SyncState => ({
  pending: null,
  inFlight: null,
  version,
  lastActivityAt: now,
  failures: 0,
  readOnly,
  hidden: false,
  tooLarge: false,
});

const merge = (a: Uint8Array | null, b: Uint8Array | null) =>
  a && b ? Y.mergeUpdates([a, b]) : (a ?? b);
/** Errors after which local changes can never be saved: the editor becomes read-only. */
const READ_ONLY_CODES: ReadonlySet<RepositoryErrorCode> = new Set(["FORBIDDEN", "SESSION_CLOSED"]);
/**
 * Errors after which local changes are dropped; the caller must then rebuild the document from
 * the server (or leave), because the local Y.Doc still contains them.
 */
const DROP_CODES: ReadonlySet<RepositoryErrorCode> = new Set(["NOT_FOUND", "VALIDATION"]);

export function reduce(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "local":
      return { ...state, pending: merge(state.pending, event.update), lastActivityAt: event.at };
    case "sent":
      return { ...state, inFlight: state.pending, pending: null };
    case "ok":
      return {
        ...state,
        inFlight: null,
        version: event.version,
        failures: 0,
        tooLarge: false,
        readOnly: event.readOnly,
        lastActivityAt: event.hadRemote ? event.at : state.lastActivityAt,
      };
    case "fail":
      if (READ_ONLY_CODES.has(event.code))
        return { ...state, pending: null, inFlight: null, readOnly: true };
      if (DROP_CODES.has(event.code)) return { ...state, pending: null, inFlight: null };
      // Keep the unsent changes, oldest first, and back off. Text too large to save stays too:
      // the person still has it on screen and in the local mirror.
      return {
        ...state,
        pending: merge(state.inFlight, state.pending),
        inFlight: null,
        failures: state.failures + 1,
        tooLarge: event.code === "DOC_TOO_LARGE",
      };
    case "visibility":
      return { ...state, hidden: event.hidden };
  }
}

export type SyncStatus = "idle" | "saving" | "offline" | "readonly" | "toolarge";
export function statusOf(state: SyncState): SyncStatus {
  if (state.readOnly) return "readonly";
  if (state.tooLarge) return "toolarge";
  if (state.failures) return "offline";
  return state.pending || state.inFlight ? "saving" : "idle";
}

/** When to sync next; null pauses polling (hidden tab with nothing to save). */
export function nextDelayMs(state: SyncState, now: number): number | null {
  if (state.hidden && !state.pending) return null;
  if (state.failures) return Math.min(SLOW_MS * 2 ** state.failures, MAX_BACKOFF_MS);
  return now - state.lastActivityAt < ACTIVITY_WINDOW_MS ? FAST_MS : SLOW_MS;
}
