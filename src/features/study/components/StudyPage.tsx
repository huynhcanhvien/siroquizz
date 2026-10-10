"use client";

import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { StudyTopBar, type StudyMode } from "@/components/layout/StudyTopBar";
import { useRecordActivity } from "@/features/progress/hooks";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/Switch";
import { EmptyState } from "@/components/ui/misc";
import { useStars, useSessionRecording } from "@/features/srs/hooks";
import { StudySessionContext } from "@/features/study/session-context";
import { SetLoader } from "@/features/sets/components/SetLoader";
import type { StudySet } from "@/lib/types";

function StudyFrame({
  set,
  mode,
  children,
}: {
  set: StudySet;
  mode: StudyMode;
  children: (set: StudySet) => ReactNode;
}) {
  const [sessionSet] = useState(() => set);
  useRecordActivity(set.id, true);
  const t = useTranslations("learning"),
    [starred, setStarred] = useState(false),
    { data: stars = [] } = useStars(set.id);
  const count = useSessionRecording(set.id, mode);
  const filtered = starred
    ? { ...sessionSet, cards: sessionSet.cards.filter((card) => stars.includes(card.id)) }
    : sessionSet;
  return (
    <>
      <StudyTopBar setId={set.id} setTitle={set.title} mode={mode} />
      <main id="main" className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
          <div className="mx-auto mb-5 max-w-3xl">
            <Switch checked={starred} onCheckedChange={setStarred} label={t("onlyStarred")} />
          </div>
        ) : null}
        <StudySessionContext.Provider value={count}>
          {filtered.cards.length ? (
            <div key={String(starred)}>{children(filtered)}</div>
          ) : (
            <EmptyState icon={<span aria-hidden>☆</span>} title={t("noStarred")} />
          )}
        </StudySessionContext.Provider>
      </main>
    </>
  );
}

/** Shared shell for every study mode: loads the set, records activity, renders the top bar. */
export function StudyPage({
  mode,
  children,
}: {
  mode: StudyMode;
  children: (set: StudySet) => ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  return (
    <SetLoader
      id={id}
      fallback={
        <div className="mx-auto mt-24 size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      }
    >
      {(set) => (
        <StudyFrame key={`${set.id}:${mode}`} set={set} mode={mode}>
          {children}
        </StudyFrame>
      )}
    </SetLoader>
  );
}
