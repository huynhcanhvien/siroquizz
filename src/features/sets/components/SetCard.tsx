"use client";

import { FileInput, PencilLine, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { SetSource, StudySet } from "@/lib/types";

const SOURCE_ICON = { manual: PencilLine, ai: WandSparkles, import: FileInput } as const;
const SOURCE_TONE = { manual: "neutral", ai: "accent", import: "primary" } as const;

export function SourceBadge({ source }: { source: SetSource }) {
  const t = useTranslations("sources");
  const Icon = SOURCE_ICON[source];
  return (
    <Badge tone={SOURCE_TONE[source]}>
      <Icon aria-hidden />
      {t(source)}
    </Badge>
  );
}

interface SetCardProps {
  set: StudySet;
  className?: string;
  footer?: React.ReactNode;
}

export function SetCard({ set, className, footer }: SetCardProps) {
  const t = useTranslations();
  const format = useFormatter();
  const tLang = useTranslations("contentLanguages");

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200",
        "focus-within:border-primary/60 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-bold text-muted">
          {t("common.cards", { count: set.cards.length })}
        </span>
        <SourceBadge source={set.source} />
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg leading-snug font-bold">
        <Link
          href={`/sets/${set.id}`}
          className="outline-none after:absolute after:inset-0 after:rounded-xl"
        >
          {set.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-muted">
        {tLang(set.termLang)} → {tLang(set.definitionLang)}
      </p>
      <div className="mt-auto pt-4 text-xs text-subtle">
        {footer ?? t("library.updated", { date: format.relativeTime(new Date(set.updatedAt)) })}
      </div>
    </article>
  );
}
