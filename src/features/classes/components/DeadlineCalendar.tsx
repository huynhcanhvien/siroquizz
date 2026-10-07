"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import {
  dayKey,
  deadlineStatus,
  groupDeadlines,
  monthDays,
  type DeadlineSet,
  type DeadlineStatus,
} from "../lib/deadline-calendar";

const tones: Record<DeadlineStatus, string> = {
  past: "bg-danger-soft text-danger",
  soon: "bg-accent-soft text-accent-text",
  upcoming: "bg-primary-soft text-primary-text",
};
const subscribe = () => () => {};

/** Delay local dates until hydration: the server can be in a different time zone. */
export function DeadlineCalendar({ sets }: { sets: DeadlineSet[] }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return mounted ? <LocalCalendar sets={sets} /> : <Skeleton className="h-80" />;
}

function LocalCalendar({ sets }: { sets: DeadlineSet[] }) {
  const t = useTranslations("classes.calendar");
  const common = useTranslations("common");
  const classes = useTranslations("classes");
  const locale = useLocale();
  const monthId = useId();
  const detailsId = useId();
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState(() => new Date());
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1, 12),
  );
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(date);
  const grouped = groupDeadlines(sets);
  const days = monthDays(month);
  const selectedKey = dayKey(selected);
  const todayKey = dayKey(new Date(now));
  const items = grouped.get(selectedKey) ?? [];
  const moveMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    setMonth(next);
    setSelected(next);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id={monthId}
          aria-live="polite"
          className="flex items-center gap-2 text-lg font-bold capitalize"
        >
          <CalendarDays className="size-5 text-primary" aria-hidden />
          {format(month, { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("previous")}
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const today = new Date();
              setNow(today.getTime());
              setSelected(today);
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12));
            }}
          >
            {t("today")}
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("next")} onClick={() => moveMonth(1)}>
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
      </div>
      {!grouped.size ? <p className="text-sm text-muted">{t("empty")}</p> : null}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <table
            aria-labelledby={monthId}
            className="w-full table-fixed border-separate border-spacing-1"
          >
            <thead>
              <tr>
                {Array.from({ length: 7 }, (_, index) => (
                  <th
                    scope="col"
                    key={index}
                    className="pb-2 text-center text-xs font-semibold text-muted"
                  >
                    <abbr
                      className="no-underline"
                      title={format(new Date(2024, 0, 1 + index, 12), { weekday: "long" })}
                    >
                      {format(new Date(2024, 0, 1 + index, 12), { weekday: "short" })}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: days.length / 7 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((date, column) => {
                    if (!date) return <td key={column} />;
                    const key = dayKey(date);
                    const deadlines = grouped.get(key) ?? [];
                    const today = key === todayKey;
                    const active = key === selectedKey;
                    return (
                      <td key={column} className="align-top">
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-current={today ? "date" : undefined}
                          aria-controls={detailsId}
                          aria-label={`${format(date, { dateStyle: "full" })}${today ? ` · ${t("today")}` : ""} · ${t("count", { count: deadlines.length })}`}
                          onClick={() => setSelected(date)}
                          className={cn(
                            "flex min-h-16 w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-lg border p-1 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-28 sm:p-2",
                            active ? "border-primary bg-primary-soft" : "border-border bg-surface",
                            today && "ring-1 ring-primary",
                          )}
                        >
                          <span
                            className={cn(
                              "flex w-full flex-wrap items-center justify-between gap-0.5 text-xs sm:text-sm",
                              today && "font-extrabold text-primary-text",
                            )}
                          >
                            <span>{format(date, { day: "numeric" })}</span>
                            {deadlines.length ? (
                              <span className="rounded-full bg-primary-soft px-1 text-[10px] font-bold text-primary-text">
                                {deadlines.length}
                              </span>
                            ) : null}
                          </span>
                          <span className="hidden w-full flex-col gap-1 sm:flex" aria-hidden>
                            {deadlines.slice(0, 2).map((set) => (
                              <span
                                key={set.setId}
                                className={cn(
                                  "block truncate rounded px-1 py-0.5 text-[10px] font-semibold",
                                  tones[deadlineStatus(set.dueAt!, now)],
                                )}
                              >
                                {set.title}
                              </span>
                            ))}
                            {deadlines.length > 2 ? (
                              <span className="text-xs text-muted">
                                {t("more", { count: deadlines.length - 2 })}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex flex-wrap gap-1 sm:hidden" aria-hidden>
                            {[
                              ...new Set(deadlines.map((set) => deadlineStatus(set.dueAt!, now))),
                            ].map((status) => (
                              <span
                                key={status}
                                className={cn(
                                  "size-2 rounded-full",
                                  status === "past"
                                    ? "bg-danger"
                                    : status === "soon"
                                      ? "bg-accent-strong"
                                      : "bg-primary",
                                )}
                              />
                            ))}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <ul aria-label={t("legend")} className="mt-3 flex flex-wrap gap-2 text-xs">
            {(["past", "soon", "upcoming"] as const).map((status) => (
              <li
                key={status}
                className={cn("rounded-full px-2 py-1 font-semibold", tones[status])}
              >
                {t(status)}
              </li>
            ))}
          </ul>
        </div>
        <section
          id={detailsId}
          aria-labelledby={`${detailsId}-title`}
          className="min-w-0 rounded-xl border border-border bg-surface-2 p-4"
        >
          <h3 id={`${detailsId}-title`} className="mb-3 font-bold" aria-live="polite">
            {format(selected, { dateStyle: "full" })}
          </h3>
          {items.length ? (
            <ul className="flex flex-col gap-3">
              {items.map((set) => (
                <li
                  key={set.setId}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
                >
                  <p className="font-semibold break-words">{set.title}</p>
                  <p className="text-xs text-muted">
                    {common("cards", { count: set.cardCount })} ·{" "}
                    {classes("dueOn", {
                      date: format(new Date(set.dueAt!), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        tones[deadlineStatus(set.dueAt!, now)],
                      )}
                    >
                      {t(deadlineStatus(set.dueAt!, now))}
                    </span>
                    <Button asChild size="sm">
                      <Link
                        href={`/sets/${set.setId}`}
                        aria-label={t("studySet", { title: set.title })}
                      >
                        {classes("study")}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("emptyDay")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
