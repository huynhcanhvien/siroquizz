"use client";

import { ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useGameScores } from "@/features/progress/hooks";
import { cn } from "@/lib/cn";
import { GAME_KINDS, type StudySet } from "@/lib/types";
import { bestScore } from "../lib/best-score";
import { formatRecord } from "./GameChrome";
import { GAME_META, eligibleCardCount } from "./game-meta";

export function GamesHub({ set }: { set: StudySet }) {
  const t = useTranslations("games");
  const { data: scores = [] } = useGameScores(set.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-title font-extrabold">{t("hubTitle")}</h1>
        <p className="mt-1 text-lg text-muted">{t("hubSubtitle", { title: set.title })}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {GAME_KINDS.map((game, index) => {
          const { icon: Icon, tone, minCards } = GAME_META[game];
          const best = bestScore(scores, game);
          const playable = eligibleCardCount(set, game) >= (game === "quiz" ? 1 : minCards);
          return (
            <li key={game} className="animate-rise" style={{ animationDelay: `${index * 60}ms` }}>
              <Link
                href={`/study/${set.id}/games/${game}`}
                aria-disabled={!playable}
                tabIndex={playable ? undefined : -1}
                onClick={(event) => {
                  if (!playable) event.preventDefault();
                }}
                className={cn(
                  "group flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm transition-[transform,box-shadow,border-color]",
                  "hover:-translate-y-1 hover:border-primary/40 hover:shadow-md",
                  !playable && "pointer-events-none opacity-50",
                )}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      "grid size-14 place-items-center rounded-2xl transition-transform group-hover:rotate-[-8deg]",
                      tone,
                    )}
                  >
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <span className="grid size-10 place-items-center rounded-full bg-primary text-on-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <ArrowRight className="size-5" aria-hidden />
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold">{t(`${game}.title`)}</h2>
                  <p className="mt-1 text-muted">{t(`${game}.description`)}</p>
                </div>
                <p className="mt-auto flex items-center gap-2 text-sm font-semibold text-muted">
                  <Trophy className="size-4 text-accent-strong" aria-hidden />
                  {playable
                    ? best
                      ? t("best", { value: formatRecord(best, game) })
                      : t("noBest")
                    : t("notEnoughCards", { count: minCards })}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
