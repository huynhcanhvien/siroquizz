"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/ui/misc";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useErrorMessage } from "@/lib/use-messages";
import { sessionPath, useOverview, useSessionAction } from "../hooks";
import type { DocSummary, SessionDetail, SessionPatch } from "../schemas";

/**
 * Seconds since an update, measured against the server clock of the last roster answer (received
 * at `receivedAt`, local time), ticking every second.
 */
function useAgo(serverTime: string | undefined, receivedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const server = serverTime ? new Date(serverTime).getTime() + (now - receivedAt) : now;
  return (iso: string) => Math.max(0, Math.round((server - new Date(iso).getTime()) / 1000));
}

function Ago({ seconds }: { seconds: number }) {
  const t = useTranslations("writing.roster");
  if (seconds < 5) return <>{t("justNow")}</>;
  if (seconds < 120) return <>{t("updated", { seconds })}</>;
  return <>{t("updatedMinutes", { minutes: Math.floor(seconds / 60) })}</>;
}

function useSessionPatch(sessionId: string) {
  const action = useSessionAction();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const patch = (body: SessionPatch, then?: () => void) =>
    action.mutate(
      { path: sessionPath(sessionId), method: "PATCH", body },
      { onSuccess: then, onError: (error) => toast(errorMessage(error), "error") },
    );
  return { patch, action };
}

function SessionControls({ session }: { session: SessionDetail }) {
  const t = useTranslations("writing.roster");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { patch, action } = useSessionPatch(session.id);
  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
  const open = session.status === "open";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button variant="secondary" size="sm" onClick={() => setConfirm("close")}>
            {t("closeSession")}
          </Button>
        ) : (
          <Button size="sm" loading={action.isPending} onClick={() => patch({ status: "open" })}>
            {session.status === "closed" ? t("reopen") : t("openSession")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setConfirm("delete")}>
          {t("delete")}
        </Button>
      </div>
      <Switch
        label={t("peerVisibility")}
        checked={session.peerVisibility === "open"}
        onCheckedChange={(checked) => patch({ peerVisibility: checked ? "open" : "hidden" })}
      />
      <Switch
        label={t("peerEditing")}
        checked={session.peerEditing}
        disabled={session.peerVisibility !== "open"}
        onCheckedChange={(checked) => patch({ peerEditing: checked })}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        title={confirm === "delete" ? t("deleteTitle") : t("closeTitle")}
        description={confirm === "delete" ? t("deleteBody") : t("closeBody")}
        confirmLabel={confirm === "delete" ? t("delete") : t("closeSession")}
        cancelLabel={tCommon("cancel")}
        loading={action.isPending}
        onConfirm={() =>
          confirm === "delete"
            ? action.mutate(
                { path: sessionPath(session.id), method: "DELETE" },
                { onSuccess: () => router.push(`/classes/${session.classId}/writing`) },
              )
            : patch({ status: "closed" }, () => setConfirm(null))
        }
      />
    </div>
  );
}

/** Live list of everyone's documents for the teacher; choosing one opens it in the editor. */
export function TeacherRoster(props: {
  session: SessionDetail;
  activeDocId: string | null;
  onSelect: (docId: string) => void;
}) {
  const { session } = props;
  const t = useTranslations("writing.roster");
  const overview = useOverview(session.id, { enabled: true, fast: session.status === "open" });
  const ago = useAgo(overview.data?.serverTime, overview.dataUpdatedAt);
  const docs = useMemo(() => {
    const byId = new Map<string, DocSummary>((session.docs ?? []).map((doc) => [doc.id, doc]));
    for (const doc of overview.data?.docs ?? []) byId.set(doc.id, doc);
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [session.docs, overview.data]);
  const names = new Map(session.members.map((member) => [member.userId, member]));
  const uid = useId();
  return (
    <div className="space-y-5">
      <SessionControls session={session} />
      <section aria-labelledby={`${uid}-roster-title`}>
        <h3 id={`${uid}-roster-title`} className="text-sm font-bold">
          {t("title")} ({docs.length})
        </h3>
        {docs.length ? null : <p className="mt-2 text-sm text-muted">{t("empty")}</p>}
        <ul className="mt-2 grid gap-2">
          {docs.map((doc) => {
            const member = names.get(doc.authorId);
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(doc.id)}
                  aria-current={props.activeDocId === doc.id}
                  className={cn(
                    "w-full rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2",
                    props.activeDocId === doc.id && "border-primary ring-2 ring-ring",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Avatar
                      name={member?.name ?? "?"}
                      color={member?.avatarColor ?? "slate"}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {member?.name ?? "—"}
                    </span>
                    <span className="text-xs text-muted">
                      <Ago seconds={ago(doc.updatedAt)} />
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-sm text-muted">
                    {doc.textPreview || "…"}
                  </span>
                  <span className="mt-1 block text-xs text-subtle">{doc.charCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
