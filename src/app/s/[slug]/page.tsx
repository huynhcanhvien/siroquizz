import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { Avatar } from "@/components/ui/misc";
import { PublicHeader } from "@/features/community/components/PublicHeader";
import { PublicFlashcards } from "@/features/community/components/PublicFlashcards";
import { PublicSetActions } from "@/features/community/components/PublicSetActions";
import { isLangCode } from "@/lib/languages";
import { currentViewerId } from "@/server/viewer";
import { ApiError } from "@/server/api-error";
import { getDatabase } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { getPublicSet } from "@/server/services/sharing";

type Props = { params: Promise<{ slug: string }> };

/** The shared set for this request's viewer (a guest when signed out); 404 when not allowed. */
const loadSet = cache(async (slug: string) => {
  if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  const viewerId = await currentViewerId();
  try {
    return { set: await getPublicSet(getDatabase(), viewerId, slug), viewerId };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { set } = await loadSet((await params).slug);
  return {
    title: set.title,
    description: set.description || undefined,
    // Only moderated public sets belong in search engines; link-only sets stay unindexed.
    robots: set.listed ? undefined : { index: false, follow: false },
  };
}

export default async function PublicSetPage({ params }: Props) {
  const { slug } = await params;
  const { set, viewerId } = await loadSet(slug);
  const t = await getTranslations("community");
  const tCommon = await getTranslations("common");
  const tLang = await getTranslations("contentLanguages");
  const termLang = isLangCode(set.termLang) ? set.termLang : "en";
  const definitionLang = isLangCode(set.definitionLang) ? set.definitionLang : "vi";

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader signedIn={viewerId !== null} returnTo={`/s/${slug}`} />
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10">
        <section aria-labelledby="set-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-surface-3 px-2.5 py-0.5 font-bold text-muted">
              {tCommon("cards", { count: set.cards.length })}
            </span>
            <span className="text-muted">
              {tLang(termLang)} → {tLang(definitionLang)}
            </span>
          </div>
          <h1 id="set-title" className="max-w-3xl text-title font-extrabold text-balance">
            {set.title}
          </h1>
          {set.description ? (
            <p className="max-w-2xl text-lg text-muted">{set.description}</p>
          ) : null}
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <Avatar name={set.author.name} color={set.author.avatarColor} size="sm" />
            {set.author.username ? (
              <Link
                href={`/u/${set.author.username}`}
                className="underline-offset-2 hover:underline"
              >
                {t("publicBy", { name: set.author.name })}
              </Link>
            ) : (
              t("publicBy", { name: set.author.name })
            )}
          </p>
          {set.isOwner ? (
            <p className="text-sm font-semibold text-primary-text">{t("ownerNotice")}</p>
          ) : null}
          <PublicSetActions
            slug={slug}
            setId={set.id}
            signedIn={viewerId !== null}
            isOwner={set.isOwner}
          />
        </section>

        <section aria-labelledby="try-title" className="flex flex-col gap-4">
          <h2 id="try-title" className="text-xl font-bold">
            {t("flashcardsTitle")}
          </h2>
          <PublicFlashcards cards={set.cards} termLang={termLang} definitionLang={definitionLang} />
          {viewerId ? null : <p className="text-sm text-muted">{t("guestStudyHint")}</p>}
        </section>

        <section aria-labelledby="terms-title" className="flex flex-col gap-3">
          <h2 id="terms-title" className="text-xl font-bold">
            {t("termsTitle", { count: set.cards.length })}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {set.cards.map((card) => (
              <li
                key={card.id}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
              >
                <span lang={termLang} className="font-semibold break-words">
                  {card.term}
                  {card.phonetic ? (
                    <span className="block text-sm font-normal text-muted">{card.phonetic}</span>
                  ) : null}
                </span>
                <span lang={definitionLang} className="break-words text-muted">
                  {card.definition}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
