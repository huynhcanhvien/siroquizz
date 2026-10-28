"use client";

import { AssignedToMe } from "@/features/classes/components/AssignedToMe";
import { PendingReviews } from "@/features/sets/collab/components/PendingReviews";
import { ArrowRight, ClipboardPaste, FolderOpen, Layers, PencilLine, Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useRecentActivity, useSetProgress } from "@/features/progress/hooks";
import { useSets } from "@/features/sets/hooks";
import { SetCard } from "@/features/sets/components/SetCard";
import { countProgress, summarizeProgress } from "@/features/sets/lib/set-utils";
import { useClientValue } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import type { StudySet, User } from "@/lib/types";

const RECENT_LIMIT = 6;
const CONTINUE_LIMIT = 3;

function greetingKey(hour: number) {
  if (hour < 11) return "greetingMorning" as const;
  if (hour < 18) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

function Greeting({ name }: { name: string }) {
  const t = useTranslations("home");
  // Hour is read on the client only so server and client markup stay identical.
  const hour = useClientValue(() => new Date().getHours(), 9);
  return (
    <div>
      <h1 className="text-title font-extrabold">{t(greetingKey(hour), { name })}</h1>
      <p className="mt-1.5 text-lg text-muted">{t("subtitle")}</p>
    </div>
  );
}

const QUICK_ACTIONS = [
  { href: "/sets/new", icon: PencilLine, title: "quickManualTitle", body: "quickManualBody", featured: false },
  { href: "/sets/new/ai", icon: WandSparkles, title: "quickAiTitle", body: "quickAiBody", featured: true },
  { href: "/sets/new?import=1", icon: ClipboardPaste, title: "quickImportTitle", body: "quickImportBody", featured: false },
] as const;

function QuickCreate() {
  const t = useTranslations("home");
  return (
    <section aria-labelledby="quick-title">
      <h2 id="quick-title" className="sr-only">
        {t("quickTitle")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_ACTIONS.map(({ href, icon: Icon, title, body, featured }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-4 rounded-xl border p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md",
              featured ? "border-accent/60 bg-accent-soft" : "border-border bg-surface shadow-sm",
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-lg transition-transform group-hover:rotate-[-6deg]",
                featured ? "bg-accent text-on-accent" : "bg-primary-soft text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{t(title)}</span>
              <span className="block text-sm text-muted">{t(body)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ set }: { set: StudySet }) {
  const t = useTranslations("home");
  // Server listings carry the viewer's counts; browser-stored sets are summarized from progress.
  const { data: progress = [] } = useSetProgress(set.id, { enabled: !set.progress });
  const counts = set.progress ?? countProgress(progress, new Set(set.cards.map((card) => card.id)));
  const summary = summarizeProgress(set.cardCount, counts);
  return (
    <Link
      href={`/study/${set.id}/flashcards`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="line-clamp-2 font-bold">{set.title}</span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </div>
      <ProgressBar value={summary.known} max={summary.total} label={set.title} tone="success" />
      <span className="text-sm text-muted">{t("progressLabel", { known: summary.known, total: summary.total })}</span>
    </Link>
  );
}

function Stats({ sets }: { sets: StudySet[] }) {
  const t = useTranslations("home");
  const cardCount = sets.reduce((total, set) => total + set.cardCount, 0);
  const items = [
    { label: t("statSets"), value: sets.length, icon: FolderOpen },
    { label: t("statCards"), value: cardCount, icon: Layers },
  ];
  return (
    <dl className="flex gap-3">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg border border-border bg-surface px-4 py-2.5 shadow-sm">
          <dt className="contents">
            <Icon className="row-span-2 size-5 text-primary" aria-hidden />
            <span className="text-xs font-semibold text-muted">{label}</span>
          </dt>
          <dd className="col-start-2 text-xl leading-tight font-extrabold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HomeDashboard({ user }: { user: User }) {
  const t = useTranslations("home");
  const setsQuery = useSets();
  const activityQuery = useRecentActivity(CONTINUE_LIMIT);
  const sets = useMemo(() => setsQuery.data ?? [], [setsQuery.data]);

  const continueSets = useMemo(() => {
    const byId = new Map(sets.map((set) => [set.id, set]));
    return (activityQuery.data ?? []).flatMap((item) => byId.get(item.setId) ?? []);
  }, [activityQuery.data, sets]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Greeting name={user.displayName} />
        {sets.length > 0 ? <Stats sets={sets} /> : null}
      </div>

      <QuickCreate />

      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
        <>
          <AssignedToMe />
          <PendingReviews />
        </>
      ) : null}

      {continueSets.length > 0 ? (
        <section aria-labelledby="continue-title">
          <h2 id="continue-title" className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Sparkles className="size-5 text-accent-strong" aria-hidden />
            {t("continueTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {continueSets.map((set) => (
              <ContinueCard key={set.id} set={set} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="recent-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-title" className="text-xl font-bold">
            {t("recentTitle")}
          </h2>
          {sets.length > RECENT_LIMIT ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/library">
                {t("viewAll")}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
        {setsQuery.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : setsQuery.isError ? (
          <QueryError error={setsQuery.error} onRetry={() => setsQuery.refetch()} />
        ) : sets.length === 0 ? (
          <EmptyState
            icon={<Layers aria-hidden />}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={
              <Button asChild>
                <Link href="/sets/new">{t("quickManualTitle")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sets.slice(0, RECENT_LIMIT).map((set) => (
              <SetCard key={set.id} set={set} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
