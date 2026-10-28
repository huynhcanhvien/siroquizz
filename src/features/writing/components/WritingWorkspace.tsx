"use client";

import { ArrowLeft, BookmarkPlus, PanelRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useSession } from "@/features/auth/hooks";
import { useOpenOwnDoc, useScratchCards, useWritingSession } from "../hooks";
import type { SyncStatus } from "../lib/sync-loop";
import { teaches } from "../lib/permissions";
import type { SessionDetail } from "../schemas";
import { SaveWordDialog } from "./SaveWordDialog";
import { ScratchDrawer } from "./ScratchDrawer";
import { SessionPanel } from "./SessionPanel";
import { StatusBadge, SyncIndicator } from "./SessionBits";
import { TeacherRoster } from "./TeacherRoster";

// Quill and Yjs load only on this route, in the editor's own chunk.
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-xl" />,
});

/** The document to show first: a student's own (created when the session is open), else the newest. */
function useActiveDoc(session: SessionDetail | undefined, userId: string | undefined) {
  const [chosen, setChosen] = useState<string | null>(null);
  const open = useOpenOwnDoc(session?.id ?? "");
  const student = session ? !teaches(session.role) : false;
  const needsOwn = Boolean(student && session?.status === "open" && !session?.myDocId);
  useEffect(() => {
    if (needsOwn && open.isIdle) open.mutate();
  }, [needsOwn, open]);
  const fallback = student
    ? (session?.myDocId ?? open.data?.id ?? null)
    : (session?.docs?.find((doc) => doc.authorId !== userId)?.id ?? session?.myDocId ?? null);
  return { activeDocId: chosen ?? fallback, setActiveDocId: setChosen };
}

function TopBar(props: { session: SessionDetail; status: SyncStatus; onScratch: () => void }) {
  const t = useTranslations("writing");
  const scratch = useScratchCards();
  return (
    <header className="flex flex-wrap items-center gap-3">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/classes/${props.session.classId}/writing`}>
          <ArrowLeft className="size-4" aria-hidden />
          {t("sessions.backToList")}
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold">{props.session.title}</h1>
      <StatusBadge status={props.session.status} />
      <SyncIndicator status={props.status} />
      <Button variant="secondary" size="sm" onClick={props.onScratch}>
        <BookmarkPlus className="size-4" aria-hidden />
        {t("scratch.button", { count: scratch.data?.length ?? 0 })}
      </Button>
    </header>
  );
}

export function WritingWorkspace({ sessionId }: { sessionId: string }) {
  const t = useTranslations("writing");
  const router = useRouter();
  const session = useWritingSession(sessionId);
  const user = useSession();
  const userId = user.data?.id;
  const { activeDocId, setActiveDocId } = useActiveDoc(session.data, userId);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [scratchOpen, setScratchOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [word, setWord] = useState<string | null>(null);
  const onStatus = useCallback((next: SyncStatus) => setStatus(next), []);
  if (session.error) return <QueryError error={session.error} onRetry={() => session.refetch()} />;
  if (!session.data || !userId) return <Skeleton className="h-[32rem] w-full rounded-xl" />;
  const detail = session.data;
  const author = detail.members.find(
    (member) => member.userId === detail.docs?.find((doc) => doc.id === activeDocId)?.authorId,
  );
  const label =
    !activeDocId || activeDocId === detail.myDocId
      ? t("editor.myDoc")
      : t("editor.docOf", { name: author?.name ?? "—" });
  const select = (docId: string) => {
    setActiveDocId(docId);
    setPanelOpen(false);
  };
  const panel = teaches(detail.role) ? (
    <TeacherRoster session={detail} activeDocId={activeDocId} onSelect={select} />
  ) : (
    <SessionPanel session={detail} userId={userId} activeDocId={activeDocId} onSelect={select} />
  );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <TopBar session={detail} status={status} onScratch={() => setScratchOpen(true)} />
      <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_22rem]">
        <section aria-label={label} className="flex min-h-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-bold">{label}</h2>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setPanelOpen(true)}
            >
              <PanelRight className="size-4" aria-hidden />
              {t("panel.toggle")}
            </Button>
          </div>
          {activeDocId ? (
            <Editor
              key={activeDocId}
              docId={activeDocId}
              userId={userId}
              members={detail.members}
              label={label}
              onStatus={onStatus}
              onSaveWord={(term) => setWord(term)}
              onGone={() => router.push(`/classes/${detail.classId}/writing`)}
            />
          ) : (
            <EmptyState
              icon={<BookmarkPlus aria-hidden />}
              title={detail.title}
              body={teaches(detail.role) ? t("roster.empty") : t("editor.notStarted")}
            />
          )}
        </section>
        <aside className="hidden rounded-xl border border-border bg-surface p-4 lg:block">
          {panel}
        </aside>
      </div>
      <Dialog open={panelOpen} onOpenChange={setPanelOpen} side="right" title={detail.title}>
        <div className="pb-4">{panel}</div>
      </Dialog>
      <ScratchDrawer open={scratchOpen} onOpenChange={setScratchOpen} />
      <SaveWordDialog term={word} sourceDocId={activeDocId} onClose={() => setWord(null)} />
    </div>
  );
}
