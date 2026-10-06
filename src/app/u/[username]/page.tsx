import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { cache } from "react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/misc";
import { ExploreCard } from "@/features/community/components/ExploreCard";
import { PublicHeader } from "@/features/community/components/PublicHeader";
import { ApiError } from "@/server/api-error";
import { getDatabase } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { getPublicProfile } from "@/server/services/profiles";
import { currentViewerId } from "@/server/viewer";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
};

const loadProfile = cache(async (username: string, page: number) => {
  if (getServerEnv().NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  const viewerId = await currentViewerId();
  try {
    return { profile: await getPublicProfile(getDatabase(), username, viewerId, page), viewerId };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});
const pageOf = (value?: string) => Math.min(20, Math.max(1, Number(value) || 1));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profile } = await loadProfile((await params).username, 1);
  return {
    title: `${profile.name} (@${profile.username})`,
    robots: profile.profilePublic ? undefined : { index: false, follow: false },
  };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const page = pageOf((await searchParams).page);
  const { profile, viewerId } = await loadProfile(username, page);
  const t = await getTranslations("community");
  const format = await getFormatter();
  const stats = [
    t("profile.sets", { count: profile.totals.sets }),
    t("profile.cards", { count: profile.totals.cards }),
    t("profile.copies", { count: profile.totals.copies }),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader signedIn={viewerId !== null} returnTo={`/u/${username}`} />
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10">
        <section aria-labelledby="profile-name" className="flex flex-wrap items-center gap-5">
          <Avatar name={profile.name} color={profile.avatarColor} size="lg" />
          <div className="flex flex-col gap-1">
            <h1 id="profile-name" className="text-title font-extrabold">
              {profile.name}
            </h1>
            <p className="font-semibold text-muted">@{profile.username}</p>
            <p className="text-sm text-muted">
              {t("profile.memberSince", {
                date: format.dateTime(new Date(profile.memberSince), {
                  month: "long",
                  year: "numeric",
                }),
              })}
            </p>
          </div>
          <ul className="flex flex-wrap gap-2 sm:ml-auto">
            {stats.map((stat) => (
              <li key={stat} className="rounded-full bg-surface-3 px-3 py-1 text-sm font-bold">
                {stat}
              </li>
            ))}
          </ul>
        </section>
        {profile.isSelf && !profile.profilePublic ? (
          <p className="rounded-lg bg-accent-soft px-4 py-3 font-semibold text-accent-text">
            {t("profile.privateNotice")}
          </p>
        ) : null}
        <section aria-labelledby="profile-sets" className="flex flex-col gap-4">
          <h2 id="profile-sets" className="text-xl font-bold">
            {t("profile.setsTitle")}
          </h2>
          {profile.sets.items.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {profile.sets.items.map((item) => (
                <li key={item.slug}>
                  <ExploreCard item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-muted">
              {t("profile.empty")}
            </p>
          )}
          {page > 1 || profile.sets.hasMore ? (
            <nav
              aria-label={t("explore.page", { page })}
              className="flex items-center justify-center gap-3"
            >
              {page > 1 ? (
                <Button asChild variant="secondary">
                  <Link href={`/u/${username}?page=${page - 1}`}>{t("explore.previous")}</Link>
                </Button>
              ) : null}
              {profile.sets.hasMore ? (
                <Button asChild variant="secondary">
                  <Link href={`/u/${username}?page=${page + 1}`}>{t("explore.next")}</Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  );
}
