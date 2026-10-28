"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Badge } from "@/components/ui/misc";
import type { SyncStatus } from "../lib/sync-loop";
import type { SessionSummary } from "../schemas";

const STATUS_TONE = { draft: "neutral", open: "success", closed: "danger" } as const;

export function StatusBadge({ status }: { status: SessionSummary["status"] }) {
  const t = useTranslations("writing.status");
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

const SYNC_TONE = {
  idle: "text-muted",
  saving: "text-muted",
  offline: "text-danger",
  readonly: "text-muted",
};
export function SyncIndicator({ status }: { status: SyncStatus }) {
  const t = useTranslations("writing.sync");
  return (
    <span role="status" aria-live="polite" className={`text-sm font-semibold ${SYNC_TONE[status]}`}>
      {t(status)}
    </span>
  );
}

/** The colour key for whose text is whose. */
export function ColorLegend() {
  const t = useTranslations("writing.panel");
  const uid = useId();
  const items = [
    ["var(--text)", t("legendAuthor")],
    ["var(--danger)", t("legendTeacher")],
    ["var(--accent-text)", t("legendPeer")],
  ] as const;
  return (
    <section aria-labelledby={`${uid}-writing-legend`}>
      <h3 id={`${uid}-writing-legend`} className="text-sm font-bold">
        {t("legend")}
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map(([color, label]) => (
          <li key={label} className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: color }} aria-hidden />
            <span style={{ color }}>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
