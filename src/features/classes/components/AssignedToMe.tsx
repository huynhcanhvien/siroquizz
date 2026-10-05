"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useAssignedToMe } from "../hooks";

const SOON_MS = 2 * 86400_000;

/** Home section listing sets assigned in the person's classes, soonest due first. */
export function AssignedToMe() {
  const t = useTranslations("classes");
  const format = useFormatter();
  const assigned = useAssignedToMe();
  if (!assigned.data?.length) return null;
  // "Due soon" is judged against when the list was fetched, which keeps rendering pure.
  const now = assigned.dataUpdatedAt;
  return (
    <section aria-labelledby="assigned-title">
      <h2 id="assigned-title" className="mb-4 flex items-center gap-2 text-xl font-bold">
        <ClipboardList className="size-5 text-primary" aria-hidden />
        {t("homeTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assigned.data.map((item) => {
          const due = item.dueAt ? new Date(item.dueAt).getTime() : null;
          const urgent = due !== null && due - now < SOON_MS;
          return (
            <li key={`${item.classId}:${item.setId}`}>
              <Link
                href={`/sets/${item.setId}`}
                className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="text-xs font-semibold text-muted">
                  {t("fromClass", { name: item.className })}
                </span>
                <span className="font-bold">{item.title}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
                  <span>{t("homeKnown", { known: item.known, total: item.cardCount })}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      urgent ? "bg-danger-soft text-danger" : "bg-surface-3 text-muted",
                    )}
                  >
                    {item.dueAt
                      ? t("dueOn", {
                          date: format.dateTime(new Date(item.dueAt), { dateStyle: "medium" }),
                        })
                      : t("noDue")}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
