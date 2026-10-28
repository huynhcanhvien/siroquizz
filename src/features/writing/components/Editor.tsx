"use client";

import "quill/dist/quill.core.css";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Quill from "quill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuillBinding } from "y-quill";
import * as Y from "yjs";
import { Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { RepositoryError, type RepositoryErrorCode } from "@/lib/repository-error";
import { useErrorMessage } from "@/lib/use-messages";
import { useDocState, writingKeys } from "../hooks";
import { authorStyles } from "../lib/author-colors";
import { unattributedInserts, type DeltaOp } from "../lib/author-ranges";
import { fromBase64 } from "../lib/base64";
import { MAX_PASTE_BYTES, SOFT_CHAR_LIMIT } from "../lib/limits";
import type { SyncStatus } from "../lib/sync-loop";
import type { SessionGate } from "../lib/permissions";
import type { SessionMember } from "../schemas";
import { EditorToolbar } from "./EditorToolbar";
import { EDITOR_FORMATS, registerAuthorFormat } from "./quill-author";
import { useSyncLoop, type SyncSetup } from "./use-sync-loop";

const TEXT_NAME = "quill";
export interface EditorProps {
  docId: string;
  userId: string;
  members: readonly SessionMember[];
  label: string;
  onStatus: (status: SyncStatus) => void;
  onSaveWord: (term: string) => void;
  onGone: () => void;
  /** Called with the session settings each sync reports. */
  onSession: (session: SessionGate) => void;
}

/**
 * Creates Quill on the element (a React 19 ref callback with cleanup), binds it to the Y.Text,
 * marks the user's own typing and counts characters.
 */
function useQuill(
  setup: SyncSetup | null,
  placeholder: string,
  label: string,
  onPasteRefused: () => void,
) {
  const [quill, setQuill] = useState<Quill | null>(null);
  const [chars, setChars] = useState(0);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !setup) return;
      registerAuthorFormat();
      const editor = new Quill(element, {
        modules: { toolbar: false, history: { userOnly: true } },
        formats: [...EDITOR_FORMATS],
        placeholder,
      });
      const binding = new QuillBinding(setup.doc.getText(TEXT_NAME), editor);
      // Runs after IME composition ends, so Telex/pinyin input is attributed once.
      const attribute = (delta: { ops: DeltaOp[] }, _old: unknown, source: string) => {
        if (source !== "user") return;
        for (const range of unattributedInserts(delta.ops, setup.userId))
          editor.formatText(range.index, range.length, "author", setup.userId, "api");
      };
      const count = () => setChars(editor.getLength() - 1);
      // A paste too large to sync is refused up front, so text is never half-saved.
      const guardPaste = (event: ClipboardEvent) => {
        const pasted = event.clipboardData?.getData("text/plain") ?? "";
        if (new TextEncoder().encode(pasted).length <= MAX_PASTE_BYTES) return;
        event.preventDefault();
        event.stopPropagation();
        onPasteRefused();
      };
      editor.root.addEventListener("paste", guardPaste, true);
      editor.on("text-change", attribute);
      editor.on("text-change", count);
      editor.root.setAttribute("aria-multiline", "true");
      editor.root.setAttribute("role", "textbox");
      editor.enable(!setup.readOnly);
      count();
      setQuill(editor);
      return () => {
        editor.off("text-change", attribute);
        editor.off("text-change", count);
        editor.root.removeEventListener("paste", guardPaste, true);
        binding.destroy();
        element.replaceChildren();
        setQuill(null);
      };
    },
    [setup, placeholder, onPasteRefused],
  );
  // The label changes once the student's own document is known; that must not rebuild Quill.
  useEffect(() => {
    quill?.root.setAttribute("aria-label", label);
  }, [quill, label]);
  return { quill, chars, ref };
}

function useDocSetup(docId: string, userId: string) {
  const query = useDocState(docId);
  const setup = useMemo<SyncSetup | null>(() => {
    if (!query.data) return null;
    const doc = new Y.Doc();
    if (query.data.state) Y.applyUpdate(doc, fromBase64(query.data.state), "remote");
    return { doc, docId, userId, version: query.data.version, readOnly: query.data.readOnly };
  }, [query.data, docId, userId]);
  useEffect(() => () => setup?.doc.destroy(), [setup]);
  return { query, setup };
}

export default function Editor(props: EditorProps) {
  const { docId, userId, members, onStatus, onGone } = props;
  const t = useTranslations("writing.editor");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { query, setup } = useDocSetup(docId, userId);
  const lastError = useRef<RepositoryErrorCode | null>(null);
  const onError = (code: RepositoryErrorCode) => {
    if (code === "NOT_FOUND") return onGone();
    // Text too large to save stays on screen and in the local mirror; say so once.
    if (code === "DOC_TOO_LARGE") {
      if (lastError.current !== code) toast(t("tooLarge"), "error");
      lastError.current = code;
      return;
    }
    lastError.current = code;
    toast(errorMessage(new RepositoryError(code)), "error");
    // Refused edits were dropped from the sync state but are still in the local document:
    // start again from the server copy so this tab never silently diverges.
    if (code !== "UNAUTHENTICATED")
      void queryClient.resetQueries({ queryKey: writingKeys.doc(docId) });
  };
  const onPasteRefused = useCallback(() => toast(t("pasteTooLong"), "error"), [toast, t]);
  const { quill, chars, ref } = useQuill(setup, t("placeholder"), props.label, onPasteRefused);
  const { status, readOnly } = useSyncLoop(setup, Boolean(quill), onError, props.onSession);
  useEffect(() => onStatus(status), [status, onStatus]);
  useEffect(() => quill?.enable(!readOnly), [quill, readOnly]);
  const authorId = query.data?.authorId;
  const styles = useMemo(() => authorStyles(authorId ?? "", members), [authorId, members]);
  if (query.error) return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <style>{styles}</style>
      <EditorToolbar quill={quill} readOnly={readOnly} onSaveWord={props.onSaveWord} />
      {!setup ? <Skeleton className="mt-3 h-96 w-full rounded-xl" /> : null}
      <div
        ref={ref}
        className="writing-editor mt-3 min-h-[24rem] flex-1 rounded-xl border border-border bg-surface text-base leading-relaxed"
      />
      <p className="mt-2 text-right text-xs text-muted" aria-live="polite">
        {t("chars", { count: chars })}
        {chars > SOFT_CHAR_LIMIT ? ` · ${t("longWarning", { count: SOFT_CHAR_LIMIT })}` : ""}
      </p>
    </div>
  );
}
