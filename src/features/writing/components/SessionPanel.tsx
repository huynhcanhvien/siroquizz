"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { useOverview } from "../hooks";
import type { SessionDetail } from "../schemas";
import { ColorLegend, StatusBadge } from "./SessionBits";

/**
 * The student's side panel: prompt, status, colour key and, when the teacher opened documents to
 * peers, classmates' documents to read (or write in).
 */
export function SessionPanel(props: {
  session: SessionDetail;
  userId: string;
  activeDocId: string | null;
  onSelect: (docId: string) => void;
}) {
  const { session } = props;
  const t = useTranslations("writing.panel");
  const tEditor = useTranslations("writing.editor");
  const peersOpen = session.peerVisibility === "open";
  const overview = useOverview(session.id, { enabled: peersOpen, fast: false });
  const docs = overview.data?.docs ?? session.docs ?? [];
  const names = new Map(session.members.map((member) => [member.userId, member.name]));
  const uid = useId();
  return (
    <div className="space-y-5">
      <section aria-labelledby={`${uid}-writing-prompt`}>
        <div className="flex items-center gap-2">
          <h3 id={`${uid}-writing-prompt`} className="text-sm font-bold">
            {t("prompt")}
          </h3>
          <StatusBadge status={session.status} />
        </div>
        <p className="mt-2 text-sm whitespace-pre-wrap">{session.prompt || "—"}</p>
      </section>
      <ColorLegend />
      {peersOpen ? (
        <section aria-labelledby={`${uid}-writing-peers`}>
          <h3 id={`${uid}-writing-peers`} className="text-sm font-bold">
            {t("peers")}
          </h3>
          {docs.length ? null : <p className="mt-2 text-sm text-muted">{t("noPeers")}</p>}
          <ul className="mt-2 space-y-1">
            {docs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  aria-current={props.activeDocId === doc.id}
                  onClick={() => props.onSelect(doc.id)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 aria-[current=true]:bg-primary-soft"
                >
                  <span className="font-semibold">
                    {doc.authorId === props.userId
                      ? tEditor("myDoc")
                      : tEditor("docOf", { name: names.get(doc.authorId) ?? "—" })}
                  </span>
                  <span className="block truncate text-muted">{doc.textPreview || "…"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
