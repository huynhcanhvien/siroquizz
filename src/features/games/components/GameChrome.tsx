"use client";

import { Gamepad2, Medal, Play, RotateCcw, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { GameKind, GameScore } from "@/lib/types";
import { formatDuration, isTimedGame } from "../lib/best-score";

export function formatRecord(best: Pick<GameScore, "score" | "timeMs">, game: GameKind): string {
  return isTimedGame(game) ? formatDuration(best.timeMs) : String(best.score);
}

export function StatChip({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label?: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 shadow-sm",
        tone === "danger" && "border-danger/40",
      )}
    >
      {Icon ? (
        <Icon
          className={cn("size-4", tone === "danger" ? "text-danger" : "text-primary")}
          aria-hidden
        />
      ) : null}
      {label ? <span className="text-xs font-semibold text-muted">{label}</span> : null}
      <span className="font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

interface GameIntroProps {
  game: GameKind;
  icon: LucideIcon;
  best: GameScore | null;
  onStart: () => void;
  /** A ranked game is being prepared with the server. */
  starting?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}

export function GameIntro({
  game,
  icon: Icon,
  best,
  onStart,
  starting = false,
  disabled = false,
  children,
}: GameIntroProps) {
  const t = useTranslations("games");
  return (
    <div className="mx-auto flex w-full max-w-lg animate-pop flex-col items-center gap-5 rounded-xl border border-border bg-surface p-8 text-center shadow-lg">
      <span className="grid size-16 place-items-center rounded-2xl bg-primary text-on-primary shadow-[0_4px_0_var(--primary-press)]">
        <Icon className="size-8" aria-hidden />
      </span>
      <div>
        <h1 className="text-title font-extrabold">{t(`${game}.title`)}</h1>
        <p className="mt-2 text-muted">{t(`${game}.description`)}</p>
      </div>
      <p className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Trophy className="size-4 text-accent-strong" aria-hidden />
        {best ? t("best", { value: formatRecord(best, game) }) : t("noBest")}
      </p>
      {children}
      <Button
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={starting || disabled}
        autoFocus
      >
        <Play className="size-5" aria-hidden />
        {starting ? t("ranked.starting") : t("start")}
      </Button>
    </div>
  );
}

interface GameResultProps {
  title: string;
  game: GameKind;
  setId: string;
  stats: Array<{ label: string; value: ReactNode }>;
  isRecord: boolean;
  onPlayAgain: () => void;
  children?: ReactNode;
}

export function GameResult({
  title,
  game,
  setId,
  stats,
  isRecord,
  onPlayAgain,
  children,
}: GameResultProps) {
  const t = useTranslations("games");
  return (
    <div className="mx-auto flex w-full max-w-lg animate-pop flex-col items-center gap-6 rounded-xl border border-border bg-surface p-8 text-center shadow-lg">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_4px_0_var(--accent-strong)]">
        <Medal className="size-8" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-muted">{t(`${game}.title`)}</p>
        <h1 className="text-title font-extrabold">{title}</h1>
        {isRecord ? (
          <p className="mt-2 inline-flex rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-on-accent dark:text-accent">
            {t("newRecord")}
          </p>
        ) : null}
      </div>
      <dl className="grid w-full grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-surface-2 p-4">
            <dt className="text-xs font-semibold text-muted">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-extrabold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {children}
      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={onPlayAgain} autoFocus>
          <RotateCcw className="size-4" aria-hidden />
          {t("playAgain")}
        </Button>
        <Button asChild size="lg" variant="secondary" className="flex-1">
          <Link href={`/study/${setId}/games`}>
            <Gamepad2 className="size-4" aria-hidden />
            {t("otherGames")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function NotEnoughCards({ setId, minCards }: { setId: string; minCards: number }) {
  const t = useTranslations("games");
  return (
    <EmptyState
      className="mx-auto max-w-lg"
      icon={<Gamepad2 aria-hidden />}
      title={t("notEnoughCards", { count: minCards })}
      action={
        <Button asChild variant="secondary">
          <Link href={`/sets/${setId}/edit`}>{t("editSet")}</Link>
        </Button>
      }
    />
  );
}
