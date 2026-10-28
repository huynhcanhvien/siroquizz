import * as Y from "yjs";
import { splitGraphemes } from "@/lib/graphemes";
import { ApiError } from "../api-error";

/** The shared Y.Text every writing document binds to Quill. */
export const TEXT_NAME = "quill";

/** A document from its stored state (null before the first sync). */
export function docFromState(state: Uint8Array | null): Y.Doc {
  const doc = new Y.Doc();
  if (state?.length) Y.applyUpdate(doc, state);
  return doc;
}

/** Merges a client's update into the document; a malformed update is the client's error. */
export function applyClientUpdate(doc: Y.Doc, update: Uint8Array): void {
  try {
    Y.applyUpdate(doc, update, "client");
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
}

/** The whole document as one update; deleted content is garbage-collected (compaction). */
export const encodeState = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);

/** What a client with state vector `sv` is missing, or null when it is up to date. */
export function diffSince(doc: Y.Doc, sv: Uint8Array): Uint8Array | null {
  let diff: Uint8Array;
  try {
    diff = Y.encodeStateAsUpdate(doc, sv);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
  // An update that carries no structs and no deletions is exactly these two zero bytes.
  return diff.length <= 2 ? null : diff;
}

export const plainText = (doc: Y.Doc): string => doc.getText(TEXT_NAME).toString();

/** A one-line preview of at most `max` whole graphemes (Vietnamese marks stay attached). */
export function preview(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  const graphemes = splitGraphemes(line);
  return graphemes.length <= max ? line : graphemes.slice(0, max).join("");
}
