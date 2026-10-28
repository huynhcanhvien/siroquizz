"use client";

import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { apiId, createHttpClient } from "@/lib/http-client";
import type { RepositoryErrorCode } from "@/lib/repository-error";
import { getBrowserStorage } from "@/lib/storage";
import { syncResponseSchema, type SyncRequest } from "../schemas";
import type { SessionGate } from "../lib/permissions";
import { createSyncLoop, replayMirror, type SyncStatus } from "../lib/sync-loop";

const client = createHttpClient();
const syncUrl = (docId: string) => `/api/v1/writing/docs/${apiId(docId)}/sync`;
/** Fire-and-forget save while the page closes (fetch keepalive, like api-generator.ts). */
function beacon(docId: string, request: SyncRequest) {
  void fetch(syncUrl(docId), {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }).catch(() => undefined);
}
const send = async (docId: string, request: SyncRequest) =>
  (await client.request(syncUrl(docId), syncResponseSchema, { method: "POST", body: request }))
    .data;

export interface SyncSetup {
  doc: Y.Doc;
  docId: string;
  userId: string;
  version: number;
  readOnly: boolean;
}
interface Reported {
  setup: SyncSetup;
  status: SyncStatus;
  readOnly: boolean;
}

/**
 * Runs the sync loop for a loaded document once the editor is bound to it (`ready`): replays
 * edits a previous visit could not save, polls, and pauses/flushes with the tab's visibility.
 * Returns the save status for the top bar and whether the document is read-only.
 */
export function useSyncLoop(
  setup: SyncSetup | null,
  ready: boolean,
  onError: (code: RepositoryErrorCode) => void,
  onSession: (session: SessionGate) => void,
): { status: SyncStatus; readOnly: boolean } {
  const [reported, setReported] = useState<Reported | null>(null);
  const onErrorRef = useRef(onError);
  const onSessionRef = useRef(onSession);
  useEffect(() => {
    onErrorRef.current = onError;
    onSessionRef.current = onSession;
  });
  useEffect(() => {
    if (!setup || !ready) return;
    const storage = getBrowserStorage();
    const loop = createSyncLoop({
      ...setup,
      send: (request) => send(setup.docId, request),
      beacon: (request) => beacon(setup.docId, request),
      storage,
      onChange: (state, status) => setReported({ setup, status, readOnly: state.readOnly }),
      onError: (code) => onErrorRef.current(code),
      onSession: (session) => onSessionRef.current(session),
    });
    if (!setup.readOnly) replayMirror(setup.doc, setup.docId, setup.userId, storage);
    loop.start();
    // A tab opened in the background never fires visibilitychange until it is shown.
    if (document.visibilityState === "hidden") loop.setHidden(true);
    const onVisibility = () => loop.setHidden(document.visibilityState === "hidden");
    const onPageHide = () => loop.flushNow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      loop.stop();
    };
  }, [setup, ready]);
  const current = reported?.setup === setup ? reported : null;
  const readOnly = current?.readOnly ?? setup?.readOnly ?? true;
  return { status: current?.status ?? (readOnly ? "readonly" : "idle"), readOnly };
}
