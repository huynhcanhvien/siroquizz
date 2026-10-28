"use client";

import { GitPullRequestArrow } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { usePendingReviews } from "../hooks";

/** Home: suggestions on my sets that wait for my decision; hidden when there are none. */
export function PendingReviews() {
  const t = useTranslations("collab");
  const { data } = usePendingReviews();
  if (!data?.length) return null;
  return (
    <section aria-labelledby="pending-reviews-title">
      <h2 id="pending-reviews-title" className="mb-4 flex items-center gap-2 text-xl font-bold">
        <GitPullRequestArrow className="size-5 text-primary" aria-hidden />
        {t("homeTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((item) => (
          <li key={item.id}>
            <Link
              href={`/sets/${item.setId}#change-requests`}
              className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="line-clamp-2 font-bold">{item.setTitle}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                <Avatar name={item.author.name} color={item.author.avatarColor} size="sm" />
                {t("by", { name: item.author.name })}
              </span>
              <span className="text-sm text-muted">
                {t("opCount", { count: item.opCount })}
                {item.className ? ` · ${item.className}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
