import { Copy, Layers } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { isLangCode } from "@/lib/languages";
import type { ExploreItem } from "@/server/services/explore";

/** One public set on Explore or a profile: the title opens it, tags filter by topic. */
export async function ExploreCard({
  item,
  featured = false,
}: {
  item: ExploreItem;
  featured?: boolean;
}) {
  const t = await getTranslations("community");
  const tCommon = await getTranslations("common");
  const tLang = await getTranslations("contentLanguages");
  const lang = (code: string) => (isLangCode(code) ? tLang(code) : code);
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        featured && "bg-gradient-to-br from-primary-soft/60 to-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5">
          <Layers className="size-3.5" aria-hidden />
          {tCommon("cards", { count: item.cardCount })}
        </span>
        <span>
          {lang(item.termLang)} → {lang(item.definitionLang)}
        </span>
        {item.copiesThisWeek > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent-text">
            <Copy className="size-3.5" aria-hidden />
            {t("explore.copies", { count: item.copiesThisWeek })}
          </span>
        ) : null}
      </div>
      <h3 className={cn("font-bold text-balance", featured ? "text-xl" : "text-lg")}>
        {/* The stretched link makes the whole card clickable; tags and author stay separate. */}
        <Link
          href={`/s/${item.slug}`}
          className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--primary)] focus-visible:after:outline-solid"
        >
          {item.title}
        </Link>
      </h3>
      {item.description ? (
        <p className="line-clamp-2 text-sm text-muted">{item.description}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
        {item.author.username ? (
          <Link
            href={`/u/${item.author.username}`}
            className="relative z-10 flex items-center gap-2 text-sm font-medium text-muted hover:text-text"
          >
            <Avatar name={item.author.name} color={item.author.avatarColor} size="sm" />
            {item.author.name}
          </Link>
        ) : (
          <span className="flex items-center gap-2 text-sm font-medium text-muted">
            <Avatar name={item.author.name} color={item.author.avatarColor} size="sm" />
            {item.author.name}
          </span>
        )}
        {item.tags.length ? (
          <ul className="relative z-10 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/explore?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold hover:border-primary hover:text-primary-text"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
