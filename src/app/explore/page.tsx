import { Compass, Flame, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/fields";
import { ExploreCard } from "@/features/community/components/ExploreCard";
import { PublicHeader } from "@/features/community/components/PublicHeader";
import { CONTENT_LANGUAGES } from "@/lib/types";
import { getDatabase } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import {
  exploreQuerySchema,
  popularThisWeek,
  searchSets,
  topTags,
  type ExploreQuery,
} from "@/server/services/explore";
import { currentViewerId } from "@/server/viewer";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("community.explore");
  return { title: t("title"), description: t("subtitle") };
}

/** Builds an Explore URL from the current query with some parameters changed. */
function exploreHref(
  query: ExploreQuery,
  changes: Partial<Record<keyof ExploreQuery, string | number | undefined>>,
) {
  const params = new URLSearchParams();
  const merged = { ...query, page: undefined, ...changes };
  for (const [key, value] of Object.entries(merged))
    if (value !== undefined && value !== "" && !(key === "page" && value === 1))
      params.set(key, String(value));
  return `/explore${params.size ? `?${params}` : ""}`;
}

export default async function ExplorePage({ searchParams }: Props) {
  if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const query = exploreQuerySchema.parse(raw);
  const db = getDatabase();
  const filtering = Boolean(
    query.q || query.termLang || query.definitionLang || query.size || query.tag,
  );
  const [viewerId, results, popular, tags] = await Promise.all([
    currentViewerId(),
    searchSets(db, query),
    filtering || query.page > 1 ? Promise.resolve([]) : popularThisWeek(db),
    topTags(db),
  ]);
  const t = await getTranslations("community.explore");
  const tLang = await getTranslations("contentLanguages");
  const heading = query.q
    ? t("resultsFor", { q: query.q })
    : query.tag
      ? t("topic", { tag: query.tag })
      : t("allSets");

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader signedIn={viewerId !== null} returnTo={exploreHref(query, {})} />
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10">
        <section aria-labelledby="explore-title" className="flex flex-col gap-5">
          <div>
            <h1 id="explore-title" className="flex items-center gap-3 text-title font-extrabold">
              <span className="grid size-11 place-items-center rounded-xl bg-primary text-on-primary shadow-[0_3px_0_var(--primary-press)]">
                <Compass className="size-6" aria-hidden />
              </span>
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-lg text-muted">{t("subtitle")}</p>
          </div>
          {/* A plain GET form: the URL holds the search, so results can be shared and bookmarked. */}
          <form
            action="/explore"
            role="search"
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex gap-2">
              <label htmlFor="explore-q" className="sr-only">
                {t("searchLabel")}
              </label>
              <Input
                id="explore-q"
                name="q"
                type="search"
                defaultValue={query.q}
                placeholder={t("searchPlaceholder")}
                maxLength={100}
              />
              <Button type="submit">
                <Search className="size-4" aria-hidden />
                {t("search")}
              </Button>
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <legend className="sr-only">{t("filters")}</legend>
              {(["termLang", "definitionLang"] as const).map((name) => (
                <label key={name} className="flex flex-col gap-1 text-sm font-semibold">
                  {t(name)}
                  <Select name={name} defaultValue={query[name] ?? ""}>
                    <option value="">{t("anyLanguage")}</option>
                    {CONTENT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {tLang(code)}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {t("size")}
                <Select name="size" defaultValue={query.size ?? ""}>
                  <option value="">{t("sizes.any")}</option>
                  {(["small", "medium", "large"] as const).map((size) => (
                    <option key={size} value={size}>
                      {t(`sizes.${size}`)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {t("sort")}
                <Select name="sort" defaultValue={results.sort}>
                  {(["relevance", "new", "popular"] as const).map((sort) => (
                    <option key={sort} value={sort}>
                      {t(`sorts.${sort}`)}
                    </option>
                  ))}
                </Select>
              </label>
            </fieldset>
            {query.tag ? <input type="hidden" name="tag" value={query.tag} /> : null}
          </form>
          {tags.length ? (
            <nav aria-label={t("topicsTitle")} className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-muted">{t("topicsTitle")}:</span>
              {tags.map((tag) => (
                <Link
                  key={tag}
                  href={exploreHref(query, { tag: query.tag === tag ? undefined : tag })}
                  aria-current={query.tag === tag ? "true" : undefined}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold hover:border-primary aria-[current]:border-primary aria-[current]:bg-primary-soft aria-[current]:text-primary-text"
                >
                  #{tag}
                </Link>
              ))}
              {query.tag ? (
                <Link
                  href={exploreHref(query, { tag: undefined })}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-text"
                >
                  <X className="size-4" aria-hidden />
                  {t("clearTopic")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        {popular.length ? (
          <section aria-labelledby="popular-title" className="flex flex-col gap-4">
            <h2 id="popular-title" className="flex items-center gap-2 text-xl font-bold">
              <Flame className="size-5 text-accent-strong" aria-hidden />
              {t("popularTitle")}
            </h2>
            {/* The week's top set gets a wide tile; the rest follow in the grid. */}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map((item, index) => (
                <li key={item.slug} className={index === 0 ? "sm:col-span-2" : undefined}>
                  <ExploreCard item={item} featured={index === 0} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="results-title" className="flex flex-col gap-4">
          <h2 id="results-title" className="text-xl font-bold">
            {heading}
          </h2>
          {results.items.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.items.map((item) => (
                <li key={item.slug}>
                  <ExploreCard item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-muted">
              {t("empty")}
            </p>
          )}
          {query.page > 1 || results.hasMore ? (
            <nav
              aria-label={t("page", { page: query.page })}
              className="flex items-center justify-center gap-3"
            >
              {query.page > 1 ? (
                <Button asChild variant="secondary">
                  <Link href={exploreHref(query, { page: query.page - 1 })}>{t("previous")}</Link>
                </Button>
              ) : null}
              <span className="text-sm font-semibold text-muted">
                {t("page", { page: query.page })}
              </span>
              {results.hasMore ? (
                <Button asChild variant="secondary">
                  <Link href={exploreHref(query, { page: query.page + 1 })}>{t("next")}</Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  );
}
